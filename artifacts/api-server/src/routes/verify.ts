import { Router } from "express";
import { pool, db, childrenTable, verificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL ?? "http://localhost:8000";
const THRESHOLD_MATCH = 0.55;
const THRESHOLD_REVIEW = 0.38;
const DET_THRESHOLD = 0.6;     // InsightFace SCRFD detection confidence gate
const LIVENESS_THRESHOLD = 0.5; // Combined temporal-variance + quality liveness gate

function vecStr(v: number[]): string {
  return `[${v.join(",")}]`;
}

function l2normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm > 1e-8 ? v.map((x) => x / norm) : v;
}

interface BatchEmbedResult {
  face_embeddings: number[][];
  face_detected: boolean[];
  det_scores: number[];
  liveness_scores: number[];
}

async function fetchEmbeddings(faceImages: string[]): Promise<BatchEmbedResult> {
  const resp = await fetch(`${FACE_SERVICE_URL}/embed/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ face_images: faceImages }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) throw new Error(`Face service HTTP ${resp.status}`);
  return resp.json() as Promise<BatchEmbedResult>;
}

router.post("/", async (req, res) => {
  const { face_images, gps_lat, gps_lng } = req.body ?? {};

  if (!Array.isArray(face_images) || face_images.length === 0) {
    return res.status(400).json({ error: "face_images is required" });
  }

  let emb: BatchEmbedResult;
  try {
    emb = await fetchEmbeddings(face_images);
  } catch (err: any) {
    return res.status(503).json({ error: `Face service unavailable: ${err.message}` });
  }

  // Collect valid (detected) frames with their scores
  const validFrames = emb.face_detected
    .map((detected, i) => ({
      detected,
      det: emb.det_scores[i],
      liveness: emb.liveness_scores[i],
      embedding: emb.face_embeddings[i],
    }))
    .filter((f) => f.detected);

  if (validFrames.length === 0) {
    return res
      .status(400)
      .json({ error: "No face detected. Please retake the photo in good light." });
  }

  // Gate 1 — detection confidence (InsightFace SCRFD score)
  const passingDet = validFrames.filter((f) => f.det >= DET_THRESHOLD);
  if (passingDet.length === 0) {
    return res.status(400).json({
      error: "Photo quality too low — move closer, ensure good lighting, and hold still.",
      error_code: "quality_low",
    });
  }

  // Gate 2 — liveness (inter-frame ArcFace temporal variance + ONNX quality)
  const passingFrames = passingDet.filter((f) => f.liveness >= LIVENESS_THRESHOLD);
  if (passingFrames.length === 0) {
    return res.status(400).json({
      error: "Live person required — please do not use a photograph.",
      error_code: "liveness_failed",
    });
  }

  // Average only threshold-passing frame embeddings for a stable representation
  const avgRaw = passingFrames[0].embedding.map((_, j) =>
    passingFrames.reduce((s, f) => s + f.embedding[j], 0) / passingFrames.length,
  );
  const faceEmb = l2normalize(avgRaw);

  const candidates = await pool.query<{
    child_id: number;
    face_dist: number;
  }>(
    `SELECT child_id, MIN(embedding <=> $1::vector) AS face_dist
     FROM child_biometrics WHERE modality = 'face'
     GROUP BY child_id ORDER BY face_dist ASC LIMIT 1`,
    [vecStr(faceEmb)],
  );

  const best = candidates.rows[0] ?? null;
  const faceSim = best ? Math.max(0, 1 - best.face_dist) : 0;

  let status: "match" | "review" | "new" = "new";
  let childRecord: Record<string, unknown> | null = null;

  if (best && faceSim >= THRESHOLD_MATCH) status = "match";
  else if (best && faceSim >= THRESHOLD_REVIEW) status = "review";

  if (status !== "new" && best) {
    const rows = await db
      .select()
      .from(childrenTable)
      .where(eq(childrenTable.id, best.child_id))
      .limit(1);
    if (rows[0]) {
      const vc = await pool.query<{ count: string }>(
        "SELECT COUNT(*)::text FROM verifications WHERE child_id = $1",
        [rows[0].id],
      );
      childRecord = {
        ...rows[0],
        created_at: rows[0].created_at.toISOString(),
        verification_count: parseInt(vc.rows[0].count, 10),
      };
    }
  }

  const reviewStatus =
    status === "match" ? "clear" : status === "review" ? "needs_review" : "clear";

  const capturePhoto = face_images[0] && face_images[0].length < 500_000 ? face_images[0] : null;

  const [verif] = await db
    .insert(verificationsTable)
    .values({
      child_id: status !== "new" && best ? best.child_id : null,
      face_score: best ? faceSim : null,
      ear_score: null,
      fused_score: best ? faceSim : null,
      review_status: reviewStatus,
      capture_photo: capturePhoto,
      gps_lat: gps_lat ?? null,
      gps_lng: gps_lng ?? null,
    })
    .returning();

  return res.json({
    status,
    confidence: best ? faceSim : null,
    child: childRecord,
    verification_id: verif.id,
  });
});

export default router;
