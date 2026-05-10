"""
Katsina State Child Verification — Face Embedding Service
Uses InsightFace (ArcFace backbone, buffalo_l model) for face embeddings.

Quality scoring:
  det_score      — InsightFace SCRFD face detection confidence (0–1).
                   Gate at >= 0.6 to reject blurry/small/occluded captures.
  liveness_score — ONNX model inference (antispoof.onnx, loaded via onnxruntime).
                   Three-component analytical model: Laplacian sharpness +
                   luminance texture + moire/periodic-band detection (inverted).
                   Gate at >= 0.5 to reject suspected photo/screen attacks.

Note on the anti-spoofing model:
  InsightFace buffalo_l ships detection, landmarks, genderage, and ArcFace
  recognition — it does NOT include an anti-spoofing model, and none is
  available for download in this environment (external downloads blocked).
  antispoof.onnx is built by build_antispoof_model.py using fixed analytical
  weights and run via onnxruntime; it is NOT a trained neural network.
  A trained model should replace it when available (task #18).
"""

import os
import base64
import logging
import io
import time

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from insightface.app import FaceAnalysis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── model paths ───────────────────────────────────────────────────────────────
_SERVICE_DIR = os.path.dirname(os.path.abspath(__file__))
_ANTISPOOF_PATH = os.path.join(_SERVICE_DIR, "antispoof.onnx")

# Global model state — loaded lazily on first request
face_app = None
_antispoof_session: ort.InferenceSession | None = None
_models_loading = False


def _ensure_models():
    """Load InsightFace and the anti-spoofing ONNX model on first call."""
    global face_app, _antispoof_session, _models_loading
    if face_app is not None:
        return
    if _models_loading:
        while _models_loading:
            time.sleep(0.1)
        return
    _models_loading = True
    try:
        logger.info("Loading InsightFace models (buffalo_l)…")
        face_app = FaceAnalysis(
            name="buffalo_l",
            root=os.path.expanduser("~/.insightface"),
            providers=["CPUExecutionProvider"],
        )
        face_app.prepare(ctx_id=-1, det_size=(320, 320))
        logger.info("InsightFace models loaded")

        # Build the ONNX anti-spoofing model if not yet present
        if not os.path.exists(_ANTISPOOF_PATH):
            logger.info("antispoof.onnx not found — building it now…")
            import build_antispoof_model
            import onnx
            m = build_antispoof_model.build()
            onnx.save(m, _ANTISPOOF_PATH)
            logger.info("antispoof.onnx built and saved")

        _antispoof_session = ort.InferenceSession(
            _ANTISPOOF_PATH,
            providers=["CPUExecutionProvider"],
        )
        logger.info("Anti-spoofing ONNX model loaded (%s)", _ANTISPOOF_PATH)
    finally:
        _models_loading = False


app = FastAPI(
    title="Katsina Biometric Face Service",
    version="0.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── helpers ──────────────────────────────────────────────────────────────────

def decode_image(b64: str) -> np.ndarray:
    """Decode a base64 data-URI or raw base64 string to an RGB numpy array."""
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[1]
    img_bytes = base64.b64decode(b64)
    pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    return np.array(pil_img)


def normalise(vec: np.ndarray) -> list[float]:
    """L2-normalise and return as Python list."""
    norm = np.linalg.norm(vec)
    if norm < 1e-8:
        return vec.tolist()
    return (vec / norm).tolist()


def compute_liveness_score(img_rgb: np.ndarray, bbox) -> float:
    """
    Run the antispoof.onnx model on the detected face region and return a
    liveness score in [0, 1].

    The ONNX model (built by build_antispoof_model.py) encodes a
    three-component analytical pipeline as proper ONNX graph operations run
    through onnxruntime:
      1. Laplacian sharpness  — blurry / out-of-focus captures score low.
      2. Luminance texture    — flat or featureless regions score low.
      3. Moire-band detection — periodic spatial-frequency energy from
                                screen pixel-grids is detected via bandpass
                                convolution kernels and INVERTED, so
                                screen/print captures score lower.

    The _antispoof_session must be loaded before calling this function
    (_ensure_models guarantees this).
    """
    if _antispoof_session is None:
        return 0.0

    h, w = img_rgb.shape[:2]
    x1 = int(max(0, bbox[0]))
    y1 = int(max(0, bbox[1]))
    x2 = int(min(w, bbox[2]))
    y2 = int(min(h, bbox[3]))
    face_crop = img_rgb[y1:y2, x1:x2]
    if face_crop.size == 0:
        return 0.0

    # Resize to 80×80, convert to [1, 3, 80, 80] float32 in [0, 255]
    from PIL import Image as _PImage
    pil_crop = _PImage.fromarray(face_crop).resize((80, 80), _PImage.BILINEAR)
    arr = np.array(pil_crop, dtype=np.float32)          # [80, 80, 3]
    arr = arr.transpose(2, 0, 1)[np.newaxis]            # [1, 3, 80, 80]

    result = _antispoof_session.run(["liveness_score"], {"input": arr})[0]
    # result may be shape () or (1,) depending on onnxruntime version
    return float(np.clip(np.asarray(result).flat[0], 0.0, 1.0))


def extract_face_result(img_rgb: np.ndarray) -> dict | None:
    """
    Detect the largest face and return a dict with:
      embedding     — L2-normalised 512-d ArcFace vector
      det_score     — InsightFace detection confidence (real model output)
      liveness_score — heuristic quality proxy (see compute_liveness_score)
    Returns None if no face is detected.
    """
    _ensure_models()
    img_bgr = img_rgb[:, :, ::-1].copy()
    faces = face_app.get(img_bgr)
    if not faces:
        return None
    best = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    return {
        "embedding": normalise(best.embedding),
        "det_score": float(best.det_score),
        "liveness_score": compute_liveness_score(img_rgb, best.bbox),
    }


# ── request / response models ─────────────────────────────────────────────────

class EmbedRequest(BaseModel):
    image: str


class EmbedResponse(BaseModel):
    embedding: list[float]
    detected: bool
    det_score: float
    liveness_score: float


class BatchEmbedRequest(BaseModel):
    face_images: list[str]


class BatchEmbedResponse(BaseModel):
    face_embeddings: list[list[float]]
    face_detected: list[bool]
    det_scores: list[float]
    liveness_scores: list[float]


# ── routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "model": "buffalo_l"}


@app.post("/embed/face", response_model=EmbedResponse)
def embed_face(req: EmbedRequest):
    t0 = time.perf_counter()
    try:
        img = decode_image(req.image)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot decode image: {exc}")

    result = extract_face_result(img)
    if result is None:
        embedding, det_score, liveness_score, detected = [0.0] * 512, 0.0, 0.0, False
    else:
        embedding = result["embedding"]
        det_score = result["det_score"]
        liveness_score = result["liveness_score"]
        detected = True

    ms = round((time.perf_counter() - t0) * 1000)
    logger.info("embed_face detected=%s det=%.2f live=%.2f latency=%dms",
                detected, det_score, liveness_score, ms)
    return EmbedResponse(
        embedding=embedding,
        detected=detected,
        det_score=det_score,
        liveness_score=liveness_score,
    )


@app.post("/embed/batch", response_model=BatchEmbedResponse)
def embed_batch(req: BatchEmbedRequest):
    """
    Process multiple face images in one call.
    Returns per-image: embedding (zero vector if no face), detected flag,
    det_score, and liveness_score.
    """
    t0 = time.perf_counter()

    face_embeddings: list[list[float]] = []
    face_detected: list[bool] = []
    det_scores: list[float] = []
    liveness_scores: list[float] = []

    for b64 in req.face_images:
        try:
            img = decode_image(b64)
            result = extract_face_result(img)
            if result is not None:
                face_embeddings.append(result["embedding"])
                face_detected.append(True)
                det_scores.append(result["det_score"])
                liveness_scores.append(result["liveness_score"])
            else:
                face_embeddings.append([0.0] * 512)
                face_detected.append(False)
                det_scores.append(0.0)
                liveness_scores.append(0.0)
        except Exception:
            face_embeddings.append([0.0] * 512)
            face_detected.append(False)
            det_scores.append(0.0)
            liveness_scores.append(0.0)

    ms = round((time.perf_counter() - t0) * 1000)
    detected_count = sum(face_detected)
    logger.info("embed_batch total=%d detected=%d latency=%dms",
                len(face_embeddings), detected_count, ms)

    return BatchEmbedResponse(
        face_embeddings=face_embeddings,
        face_detected=face_detected,
        det_scores=det_scores,
        liveness_scores=liveness_scores,
    )
