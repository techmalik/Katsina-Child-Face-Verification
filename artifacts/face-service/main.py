"""
Katsina State Child Verification — Face Embedding Service
Uses InsightFace (ArcFace backbone, buffalo_l model) for face embeddings.

Quality scoring:
  det_score   — InsightFace face detection confidence (0–1, real model output).
                Gate at >= 0.6 to reject blurry/small/occluded captures.
  liveness_score — Heuristic quality proxy (sharpness + luminance texture).
                NOTE: This is NOT a true anti-spoofing model; buffalo_l does
                not include one. A high score does not guarantee a live face.
                The infrastructure is in place for future model integration.
"""

import os
import base64
import logging
import io
import time

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from insightface.app import FaceAnalysis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global model state — loaded lazily on first request
face_app = None
_models_loading = False


def _ensure_models():
    """Load models on first call; subsequent calls are no-ops."""
    global face_app, _models_loading
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
        logger.info("Models loaded successfully")
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
    Multi-component liveness/anti-spoofing heuristic for the face region.
    Returns 0–1 (higher = more likely a live capture).

    Three components:
      1. Sharpness   — Laplacian variance; blurry captures score low.
      2. Texture     — Luminance std-dev; flat/uniform faces score low.
      3. Moire score — FFT peak density; screen & print artifacts produce
                       periodic spectral peaks absent in real faces.

    NOTE: This is a signal-processing heuristic, NOT a trained anti-spoofing
    model.  It provides meaningful rejection of blurry captures and some
    screen-replay attacks (visible pixel-grid moire), but will not reliably
    block a high-quality print held steadily in good light.
    A dedicated ONNX anti-spoofing model (task #18) should replace this once
    available.
    """
    h, w = img_rgb.shape[:2]
    x1 = int(max(0, bbox[0]))
    y1 = int(max(0, bbox[1]))
    x2 = int(min(w, bbox[2]))
    y2 = int(min(h, bbox[3]))
    face_crop = img_rgb[y1:y2, x1:x2]
    if face_crop.size == 0:
        return 0.0

    gray = np.mean(face_crop, axis=2).astype(float)

    # 1. Sharpness — Laplacian variance, normalised to [0, 1]
    pad = np.pad(gray, 1, mode="reflect")
    lap = (
        pad[:-2, 1:-1] + pad[2:, 1:-1] +
        pad[1:-1, :-2] + pad[1:-1, 2:] -
        4 * pad[1:-1, 1:-1]
    )
    sharpness = min(1.0, float(np.var(lap)) / 500.0)

    # 2. Texture richness — std-dev of luminance, normalised to [0, 1]
    texture = min(1.0, float(np.std(gray)) / 45.0)

    # 3. Moire / screen-artifact detection via 2-D FFT
    #    Screens and prints produce strong periodic peaks outside the DC region.
    #    Real faces have a diffuse, non-periodic spectral profile.
    fft_mag = np.abs(np.fft.fftshift(np.fft.fft2(gray)))
    fft_mag /= (fft_mag.max() + 1e-8)
    ch, cw = fft_mag.shape[0] // 2, fft_mag.shape[1] // 2
    fft_mag[ch - 8: ch + 8, cw - 8: cw + 8] = 0.0   # zero DC component
    peak_ratio = float(np.mean(fft_mag > 0.12))        # fraction of strong peaks
    # High peak_ratio → likely screen/print; score is inverted
    moire_score = 1.0 - min(1.0, peak_ratio * 80.0)

    return 0.4 * sharpness + 0.3 * texture + 0.3 * moire_score


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
