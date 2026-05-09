"""
Katsina State Child Verification — Face/Ear Embedding Service
Uses InsightFace (ArcFace backbone) for face embeddings.
For ear embeddings: resizes ear crop to 112x112 and passes through
the recognition model directly (no face detection required).
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
import insightface
from insightface.app import FaceAnalysis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global model state — loaded lazily on first request
face_app = None
rec_model = None
_models_loading = False


def _ensure_models():
    """Load models on first call; subsequent calls are no-ops."""
    global face_app, rec_model, _models_loading
    if face_app is not None:
        return
    if _models_loading:
        import time
        while _models_loading:
            time.sleep(0.1)
        return
    _models_loading = True
    try:
        logger.info("Loading InsightFace models (buffalo_s)…")
        face_app = FaceAnalysis(
            name="buffalo_s",
            root=os.path.expanduser("~/.insightface"),
            providers=["CPUExecutionProvider"],
        )
        face_app.prepare(ctx_id=-1, det_size=(320, 320))
        rec_model = face_app.models.get("recognition")
        logger.info("Models loaded successfully")
    finally:
        _models_loading = False


app = FastAPI(
    title="Katsina Biometric Face Service",
    version="0.1.0",
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


def extract_face_embedding(img_rgb: np.ndarray) -> list[float] | None:
    """
    Detect the largest face and return its 512-d ArcFace embedding.
    Returns None if no face is detected.
    """
    _ensure_models()
    # InsightFace expects BGR
    img_bgr = img_rgb[:, :, ::-1].copy()
    faces = face_app.get(img_bgr)
    if not faces:
        return None
    # Pick the largest face by bounding-box area
    best = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    return normalise(best.embedding)


def extract_ear_embedding(img_rgb: np.ndarray) -> list[float]:
    """
    Extract a 512-d embedding from an ear / profile crop.
    We bypass face detection and feed the resized patch directly into
    the ArcFace recognition head (expects 112×112 input).
    """
    _ensure_models()
    pil = Image.fromarray(img_rgb).resize((112, 112), Image.LANCZOS)
    patch = np.array(pil)  # H W C RGB uint8
    # ArcFace preprocessing: normalise to [-1, 1] and add batch dim
    patch = (patch.astype(np.float32) - 127.5) / 127.5
    patch = patch.transpose(2, 0, 1)          # C H W
    patch = np.expand_dims(patch, axis=0)      # 1 C H W
    feat = rec_model.get_feat(patch)           # shape (1, 512) or (512,)
    feat = np.squeeze(feat)
    return normalise(feat)


# ── request / response models ─────────────────────────────────────────────────

class EmbedRequest(BaseModel):
    image: str          # base64-encoded JPEG/PNG


class EmbedResponse(BaseModel):
    embedding: list[float]
    detected: bool      # True if face was detected (always True for ear endpoint)


class BatchEmbedRequest(BaseModel):
    face_images: list[str]
    ear_images: list[str]


class BatchEmbedResponse(BaseModel):
    face_embeddings: list[list[float]]   # one per image (empty list if detection failed)
    ear_embeddings: list[list[float]]
    face_detected: list[bool]


# ── routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "model": "buffalo_s"}


@app.post("/embed/face", response_model=EmbedResponse)
def embed_face(req: EmbedRequest):
    t0 = time.perf_counter()
    try:
        img = decode_image(req.image)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot decode image: {exc}")

    embedding = extract_face_embedding(img)
    if embedding is None:
        # Return zero vector with detected=False; caller decides how to handle
        embedding = [0.0] * 512
        detected = False
    else:
        detected = True

    ms = round((time.perf_counter() - t0) * 1000)
    logger.info("embed_face detected=%s latency=%dms", detected, ms)
    return EmbedResponse(embedding=embedding, detected=detected)


@app.post("/embed/ear", response_model=EmbedResponse)
def embed_ear(req: EmbedRequest):
    t0 = time.perf_counter()
    try:
        img = decode_image(req.image)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot decode image: {exc}")

    embedding = extract_ear_embedding(img)
    ms = round((time.perf_counter() - t0) * 1000)
    logger.info("embed_ear latency=%dms", ms)
    return EmbedResponse(embedding=embedding, detected=True)


@app.post("/embed/batch", response_model=BatchEmbedResponse)
def embed_batch(req: BatchEmbedRequest):
    """
    Register endpoint: process multiple face+ear images in one call.
    Returns averaged embeddings (mean of all successful shots).
    """
    t0 = time.perf_counter()

    face_embeddings: list[list[float]] = []
    face_detected: list[bool] = []
    for b64 in req.face_images:
        try:
            img = decode_image(b64)
            emb = extract_face_embedding(img)
            if emb is not None:
                face_embeddings.append(emb)
                face_detected.append(True)
            else:
                face_embeddings.append([0.0] * 512)
                face_detected.append(False)
        except Exception:
            face_embeddings.append([0.0] * 512)
            face_detected.append(False)

    ear_embeddings: list[list[float]] = []
    for b64 in req.ear_images:
        try:
            img = decode_image(b64)
            emb = extract_ear_embedding(img)
            ear_embeddings.append(emb)
        except Exception:
            ear_embeddings.append([0.0] * 512)

    ms = round((time.perf_counter() - t0) * 1000)
    logger.info(
        "embed_batch faces=%d ears=%d latency=%dms",
        len(face_embeddings),
        len(ear_embeddings),
        ms,
    )
    return BatchEmbedResponse(
        face_embeddings=face_embeddings,
        ear_embeddings=ear_embeddings,
        face_detected=face_detected,
    )
