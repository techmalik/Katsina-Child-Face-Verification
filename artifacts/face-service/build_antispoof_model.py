"""
Build the quality-gate ONNX model (antispoof.onnx) used by the face service.

Three components, all implemented as fixed-weight ONNX graph operations run
through onnxruntime:
  1. Laplacian sharpness  — blurry/out-of-focus captures score low.
  2. Luminance texture    — flat or featureless regions score low.
  3. Spatial contrast     — four-quadrant luminance variance; underexposed or
                            uniformly-lit cards score low.

Input : [1, 3, 80, 80] float32, values in [0, 255]
Output: [] float32 quality score in [0, 1]

Limitation: this gate rejects blurry, flat, and underexposed captures but
cannot distinguish a sharp live face from a clear printed photograph.
A trained anti-spoofing model (task #18) should replace it when available.

Run this script once to write antispoof.onnx alongside it.
"""

import os
import numpy as np
import onnx
from onnx import helper, TensorProto, numpy_helper

OPSET = 13
MODEL_PATH = os.path.join(os.path.dirname(__file__), "antispoof.onnx")


def _const(name: str, array: np.ndarray):
    return numpy_helper.from_array(array.astype(np.float32), name=name)


def build() -> onnx.ModelProto:
    inits: list = []
    nodes: list = []

    # Grayscale: Conv [1,3,80,80] x [1,3,1,1] → [1,1,80,80], then /255 → [0,1]
    gray_w = np.array([0.299, 0.587, 0.114], dtype=np.float32).reshape(1, 3, 1, 1)
    inits.append(_const("gray_w", gray_w))
    nodes.append(helper.make_node("Conv", ["input", "gray_w"], ["gray"]))
    inits.append(_const("c255", np.array([255.0])))
    nodes.append(helper.make_node("Div", ["gray", "c255"], ["gray_n"]))

    inits.append(_const("c0f", np.array([0.0])))
    inits.append(_const("c1f", np.array([1.0])))

    # Component 1: Laplacian sharpness
    # Conv [1,1,80,80] → [1,1,78,78]; sharpness = mean(lap²) / 0.002
    lap_k = np.array([[0, -1, 0], [-1, 4, -1], [0, -1, 0]], dtype=np.float32).reshape(1, 1, 3, 3)
    inits.append(_const("lap_k", lap_k))
    nodes.append(helper.make_node("Conv", ["gray_n", "lap_k"], ["lap_out"]))
    nodes.append(helper.make_node("Mul", ["lap_out", "lap_out"], ["lap_sq"]))
    nodes.append(helper.make_node("ReduceMean", ["lap_sq"], ["lap_mean"],
                                  axes=list(range(4)), keepdims=0))
    inits.append(_const("lap_scale", np.array([0.002])))
    nodes.append(helper.make_node("Div", ["lap_mean", "lap_scale"], ["sharp_raw"]))
    nodes.append(helper.make_node("Clip", ["sharp_raw", "c0f", "c1f"], ["sharp"]))

    # Component 2: Luminance texture (std-dev of gray_n, normalised by 0.18)
    nodes.append(helper.make_node("ReduceMean", ["gray_n"], ["gn_mean"],
                                  axes=list(range(4)), keepdims=1))
    nodes.append(helper.make_node("Sub", ["gray_n", "gn_mean"], ["gn_c"]))
    nodes.append(helper.make_node("Mul", ["gn_c", "gn_c"], ["gn_sq"]))
    nodes.append(helper.make_node("ReduceMean", ["gn_sq"], ["gn_var"],
                                  axes=list(range(4)), keepdims=0))
    nodes.append(helper.make_node("Sqrt", ["gn_var"], ["gn_std"]))
    inits.append(_const("tex_scale", np.array([0.18])))
    nodes.append(helper.make_node("Div", ["gn_std", "tex_scale"], ["tex_raw"]))
    nodes.append(helper.make_node("Clip", ["tex_raw", "c0f", "c1f"], ["tex"]))

    # Component 3: Spatial contrast (inter-quadrant luminance variance)
    # AveragePool 40×40, stride 40 → [1,1,2,2] quadrant means
    nodes.append(helper.make_node(
        "AveragePool", ["gray_n"], ["quad_means"],
        kernel_shape=[40, 40], strides=[40, 40],
    ))
    nodes.append(helper.make_node("ReduceMean", ["quad_means"], ["qm_mean"],
                                  axes=[0, 1, 2, 3], keepdims=1))
    nodes.append(helper.make_node("Sub", ["quad_means", "qm_mean"], ["qm_c"]))
    nodes.append(helper.make_node("Mul", ["qm_c", "qm_c"], ["qm_sq"]))
    nodes.append(helper.make_node("ReduceMean", ["qm_sq"], ["qm_var"],
                                  axes=[0, 1, 2, 3], keepdims=0))
    inits.append(_const("qm_scale", np.array([0.002])))
    nodes.append(helper.make_node("Div", ["qm_var", "qm_scale"], ["contrast_raw"]))
    nodes.append(helper.make_node("Clip", ["contrast_raw", "c0f", "c1f"], ["contrast"]))

    # Combine: 0.45 * sharp + 0.30 * tex + 0.25 * contrast
    inits.append(_const("w_sharp", np.array([0.45])))
    inits.append(_const("w_tex", np.array([0.30])))
    inits.append(_const("w_contrast", np.array([0.25])))
    nodes.append(helper.make_node("Mul", ["sharp", "w_sharp"], ["ws"]))
    nodes.append(helper.make_node("Mul", ["tex", "w_tex"], ["wt"]))
    nodes.append(helper.make_node("Mul", ["contrast", "w_contrast"], ["wc"]))
    nodes.append(helper.make_node("Add", ["ws", "wt"], ["wst"]))
    nodes.append(helper.make_node("Add", ["wst", "wc"], ["liveness_score"]))

    graph = helper.make_graph(
        nodes,
        "quality_gate_v1",
        [helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, 3, 80, 80])],
        [helper.make_tensor_value_info("liveness_score", TensorProto.FLOAT, [])],
        initializer=inits,
    )

    model = helper.make_model(
        graph,
        opset_imports=[helper.make_opsetid("", OPSET)],
    )
    model.ir_version = 7
    model.doc_string = (
        "Capture quality gate for Katsina Child Verification. "
        "Laplacian sharpness + luminance texture + spatial contrast. "
        "Analytical weights; not a trained anti-spoofing model."
    )
    onnx.checker.check_model(model)
    return model


if __name__ == "__main__":
    m = build()
    onnx.save(m, MODEL_PATH)
    print(f"Saved {MODEL_PATH}  ({os.path.getsize(MODEL_PATH)} bytes)")

    import onnxruntime as ort
    sess = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
    dummy = np.random.randint(50, 200, (1, 3, 80, 80)).astype(np.float32)
    out = sess.run(["liveness_score"], {"input": dummy})[0]
    print(f"Smoke-test score: {float(np.asarray(out).flat[0]):.4f}")
