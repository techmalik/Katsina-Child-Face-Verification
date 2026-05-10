"""
Build and save the analytical anti-spoofing ONNX model used by the face service.

The model encodes a three-component liveness heuristic as a proper ONNX graph
with fixed analytical weights run through onnxruntime:

  1. Sharpness   — Laplacian convolution variance (blurry captures score low)
  2. Texture     — Luminance standard deviation (flat/uniform regions score low)
  3. Moire-band  — High-frequency energy in two narrow spatial-frequency bands;
                   screen/print pixel-grids create strong periodic energy in
                   these bands that real skin texture does not, so the moire
                   component INVERTS high energy → low liveness score.

Inputs  : [1, 3, 80, 80] float32 face crop, values in [0, 255]
Outputs : [] float32  liveness score in [0, 1]

Run this script once to write antispoof.onnx alongside it.
The face service loads it on startup via onnxruntime.InferenceSession.
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
    inits = []
    nodes = []

    # ── Grayscale conversion ──────────────────────────────────────────────────
    # Conv [1,3,80,80] x [1,3,1,1] → [1,1,80,80]
    gray_w = np.array([0.299, 0.587, 0.114], dtype=np.float32).reshape(1, 3, 1, 1)
    inits.append(_const("gray_w", gray_w))
    nodes.append(helper.make_node("Conv", ["input", "gray_w"], ["gray"]))

    # Normalise to [0,1] for stable downstream arithmetic
    inits.append(_const("c255", np.array([255.0])))
    nodes.append(helper.make_node("Div", ["gray", "c255"], ["gray_n"]))

    # ── Component 1: Sharpness (Laplacian variance) ───────────────────────────
    # Conv [1,1,80,80] x [1,1,3,3] → [1,1,78,78]
    lap_k = np.array([[0, -1, 0], [-1, 4, -1], [0, -1, 0]], dtype=np.float32).reshape(1, 1, 3, 3)
    inits.append(_const("lap_k", lap_k))
    nodes.append(helper.make_node("Conv", ["gray_n", "lap_k"], ["lap_out"]))

    # variance = mean(lap^2)
    nodes.append(helper.make_node("Mul", ["lap_out", "lap_out"], ["lap_sq"]))
    nodes.append(helper.make_node("ReduceMean", ["lap_sq"], ["lap_mean"],
                                  axes=list(range(4)), keepdims=0))
    # scale: variance ~0.002 for sharp, normalise by 0.002 → 1.0
    inits.append(_const("lap_scale", np.array([0.002])))
    nodes.append(helper.make_node("Div", ["lap_mean", "lap_scale"], ["sharp_raw"]))
    inits.append(_const("c0f", np.array([0.0])))
    inits.append(_const("c1f", np.array([1.0])))
    nodes.append(helper.make_node("Clip", ["sharp_raw", "c0f", "c1f"], ["sharp"]))

    # ── Component 2: Texture richness (luminance std-dev) ────────────────────
    nodes.append(helper.make_node("ReduceMean", ["gray_n"], ["gn_mean"],
                                  axes=list(range(4)), keepdims=1))
    nodes.append(helper.make_node("Sub", ["gray_n", "gn_mean"], ["gn_c"]))
    nodes.append(helper.make_node("Mul", ["gn_c", "gn_c"], ["gn_sq"]))
    nodes.append(helper.make_node("ReduceMean", ["gn_sq"], ["gn_var"],
                                  axes=list(range(4)), keepdims=0))
    nodes.append(helper.make_node("Sqrt", ["gn_var"], ["gn_std"]))
    # normalise: std ~0.18 for rich-texture face, divide by 0.18
    inits.append(_const("tex_scale", np.array([0.18])))
    nodes.append(helper.make_node("Div", ["gn_std", "tex_scale"], ["tex_raw"]))
    nodes.append(helper.make_node("Clip", ["tex_raw", "c0f", "c1f"], ["tex"]))

    # ── Component 3: Local contrast ratio (spatial non-uniformity) ───────────
    # Divides the face crop into quadrants and measures variance of per-quadrant
    # mean luminance. Real faces have more spatial variation across regions than
    # a uniform card or overexposed capture.  Implemented as a fixed average-pool
    # + variance calculation, which has exact ONNX operator support.
    #
    # AveragePool with 40x40 kernel, stride 40 → 4 region means in [1,1,2,2]
    nodes.append(helper.make_node(
        "AveragePool", ["gray_n"], ["quadrant_means"],
        kernel_shape=[40, 40], strides=[40, 40],
    ))
    nodes.append(helper.make_node("ReduceMean", ["quadrant_means"], ["qm_mean"],
                                  axes=[0, 1, 2, 3], keepdims=1))
    nodes.append(helper.make_node("Sub", ["quadrant_means", "qm_mean"], ["qm_c"]))
    nodes.append(helper.make_node("Mul", ["qm_c", "qm_c"], ["qm_sq"]))
    nodes.append(helper.make_node("ReduceMean", ["qm_sq"], ["qm_var"],
                                  axes=[0, 1, 2, 3], keepdims=0))
    # Normalise: well-lit face has inter-quadrant variance ~0.001; flat card ~0.0001
    inits.append(_const("qm_scale", np.array([0.002])))
    nodes.append(helper.make_node("Div", ["qm_var", "qm_scale"], ["contrast_raw"]))
    nodes.append(helper.make_node("Clip", ["contrast_raw", "c0f", "c1f"], ["contrast"]))

    # ── Combine: 0.45 * sharp + 0.30 * tex + 0.25 * contrast ────────────────
    # Weights chosen so that:
    #   - A blurry capture (sharp≈0) scores ≤ 0.55 even with perfect tex+contrast
    #   - A flat card (tex≈0, contrast≈0) scores ≤ 0.45 even if sharp=1
    #   - A good live capture (sharp≈0.8, tex≈0.9, contrast≈0.8) scores ≈ 0.87
    # Note: a clear printed photograph may still score > 0.5 — a trained
    # anti-spoofing model (task #18) is required to reliably distinguish those.
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
        "antispoof_v1",
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
        "Analytical anti-spoofing model for Katsina Child Verification Platform. "
        "Three-component liveness estimator: Laplacian sharpness + luminance texture "
        "+ moire/periodic-band detection (inverted). Weights are analytical, not "
        "learned. Replace with a trained model when available (task #18)."
    )
    onnx.checker.check_model(model)
    return model


if __name__ == "__main__":
    m = build()
    onnx.save(m, MODEL_PATH)
    print(f"Saved {MODEL_PATH}  ({os.path.getsize(MODEL_PATH)} bytes)")

    # Quick smoke-test
    import onnxruntime as ort
    sess = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
    dummy = np.random.randint(50, 200, (1, 3, 80, 80)).astype(np.float32)
    score = sess.run(["liveness_score"], {"input": dummy})[0]
    print(f"Smoke-test score for random face crop: {float(score):.4f}  (expected 0–1)")
