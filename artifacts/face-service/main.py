"""
Katsina State Child Verification — Face Embedding Service

Models loaded on first request:
  buffalo_l   — InsightFace pack: SCRFD detection, ArcFace (w600k_r50)
                recognition, landmark and genderage models.
  antispoof   — quality_gate_v1 ONNX (antispoof.onnx) via onnxruntime.
                Scores per-frame capture quality (sharpness, texture,
                spatial contrast) in [0, 1].

Liveness scoring (liveness_score in BatchEmbedResponse):
  Two-component score returned by /embed/batch:
    1. Inter-frame ArcFace embedding variance (60 % weight)
       A live face shows natural micro-movement across 300 ms frames;
       a static photo or screen replay produces near-identical embeddings.
       Backed by buffalo_l ArcFace model outputs.
    2. Per-frame capture quality from antispoof.onnx (40 % weight)
       Rejects blurry, flat, and underexposed captures.

  Limitation: a smoothly-played high-quality video replay has similar
  inter-frame variance to a live face and may not be rejected.  A dedicated
  trained anti-spoofing model (task #18) should be added for full coverage.
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
    """Load InsightFace and the quality-gate ONNX model on first call."""
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


@app.on_event("startup")
def startup_preload_models():
    """Pre-warm InsightFace and anti-spoofing models on service startup.

    InsightFace's buffalo_l pack loads lazily by default.  In production
    the first real request (a child registration) would block for 30-60 s
    while models download and initialise, causing an API timeout.  Calling
    _ensure_models() here moves that cost to the startup phase so every
    subsequent request is fast.
    """
    logger.info("Startup: pre-warming face models…")
    _ensure_models()
    logger.info("Startup: face models ready")


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


def compute_quality_score(img_rgb: np.ndarray, bbox) -> float:
    """Run antispoof.onnx on the face bounding box crop; return quality score in [0, 1]."""
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

    from PIL import Image as _PImage
    pil_crop = _PImage.fromarray(face_crop).resize((80, 80), _PImage.BILINEAR)
    arr = np.array(pil_crop, dtype=np.float32)          # [80, 80, 3]
    arr = arr.transpose(2, 0, 1)[np.newaxis]            # [1, 3, 80, 80]

    result = _antispoof_session.run(["liveness_score"], {"input": arr})[0]
    return float(np.clip(np.asarray(result).flat[0], 0.0, 1.0))


def compute_batch_liveness_scores(
    imgs: list[np.ndarray],
    face_results: list[dict | None],
) -> list[float]:
    """
    Compute per-frame liveness scores combining two components:

    1. Inter-frame ArcFace embedding temporal variance (60 % weight)
       ArcFace (buffalo_l / w600k_r50) encodes facial appearance; a live
       face shows measurable micro-movement between frames captured 300 ms
       apart, while a static printed photo or frozen screen produces
       near-identical embeddings.  Scale: static photo ≈ 0.0–0.002
       cosine distance; live face ≈ 0.005–0.05+ cosine distance.

    2. Per-frame capture quality from antispoof.onnx (40 % weight)
       Rejects blurry, flat, and underexposed crops.

    Requires at least 2 detected frames to compute temporal variance;
    single-frame inputs fall back to quality-only scoring.
    """
    n = len(imgs)

    quality_scores: list[float] = []
    for img, face in zip(imgs, face_results):
        if face is None:
            quality_scores.append(0.0)
        else:
            quality_scores.append(compute_quality_score(img, face["bbox"]))

    detected_indices = [i for i in range(n) if face_results[i] is not None]

    if len(detected_indices) < 2:
        # Cannot compute temporal variance with a single detected frame.
        return quality_scores

    # Inter-frame cosine distances using L2-normalised ArcFace embeddings
    embeddings = [np.array(face_results[i]["embedding"]) for i in detected_indices]
    distances: list[float] = []
    for i in range(len(embeddings) - 1):
        cos_dist = max(0.0, 1.0 - float(np.dot(embeddings[i], embeddings[i + 1])))
        distances.append(cos_dist)
    mean_dist = float(np.mean(distances))

    # Normalise: >= 0.005 cosine distance is confidently "live"
    temporal_score = min(1.0, mean_dist / 0.005)

    liveness_scores: list[float] = []
    for i in range(n):
        if face_results[i] is not None:
            liveness_scores.append(0.6 * temporal_score + 0.4 * quality_scores[i])
        else:
            liveness_scores.append(0.0)

    return liveness_scores


def extract_face_result(img_rgb: np.ndarray) -> dict | None:
    """
    Detect the largest face and return a dict with:
      embedding   — L2-normalised 512-d ArcFace vector (real model output)
      det_score   — InsightFace SCRFD detection confidence (real model output)
      bbox        — [x1, y1, x2, y2] used for quality scoring
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
        "bbox": best.bbox,
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
        # Single-frame: liveness falls back to quality-only (no temporal variance)
        liveness_score = compute_quality_score(img, result["bbox"])
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

    liveness_scores combines inter-frame ArcFace embedding temporal variance
    (60 %) with per-frame ONNX quality scoring (40 %).  For batches of >= 2
    detected frames this provides a real liveness signal backed by InsightFace
    model outputs.
    """
    t0 = time.perf_counter()

    imgs: list[np.ndarray] = []
    face_results: list[dict | None] = []

    for b64 in req.face_images:
        try:
            img = decode_image(b64)
            imgs.append(img)
            face_results.append(extract_face_result(img))
        except Exception:
            imgs.append(np.zeros((1, 1, 3), dtype=np.uint8))
            face_results.append(None)

    liveness_scores = compute_batch_liveness_scores(imgs, face_results)

    face_embeddings: list[list[float]] = []
    face_detected: list[bool] = []
    det_scores: list[float] = []

    for result in face_results:
        if result is not None:
            face_embeddings.append(result["embedding"])
            face_detected.append(True)
            det_scores.append(result["det_score"])
        else:
            face_embeddings.append([0.0] * 512)
            face_detected.append(False)
            det_scores.append(0.0)

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
