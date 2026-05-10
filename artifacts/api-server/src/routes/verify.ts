import { Router } from "express";
import { pool, db, childrenTable, verificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL ?? "http://localhost:8000";
const THRESHOLD_MATCH = 0.55;
const THRESHOLD_REVIEW = 0.38;

function vecStr(v: number[]): string {
  return `[${v.join(",")}]`;
}

async function fetchFaceEmbedding(faceImage: string) {
  const resp = await fetch(`${FACE_SERVICE_URL}/embed/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ face_images: [faceImage] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) throw new Error(`Face service HTTP ${resp.status}`);
  return resp.json() as Promise<{
    face_embeddings: number[][];
    face_detected: boolean[];
  }>;
}

router.post("/", async (req, res) => {
  const { face_image, gps_lat, gps_lng } = req.body ?? {};

  if (!face_image) {
    return res.status(400).json({ error: "face_image is required" });
  }

  let emb: Awaited<ReturnType<typeof fetchFaceEmbedding>>;
  try {
    emb = await fetchFaceEmbedding(face_image);
  } catch (err: any) {
    return res.status(503).json({ error: `Face service unavailable: ${err.message}` });
  }

  const faceEmb = emb.face_embeddings[0];

  if (!emb.face_detected[0]) {
    return res
      .status(400)
      .json({ error: "No face detected. Please retake the photo in good light." });
  }

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

  const [verif] = await db
    .insert(verificationsTable)
    .values({
      child_id: status !== "new" && best ? best.child_id : null,
      face_score: best ? faceSim : null,
      ear_score: null,
      fused_score: best ? faceSim : null,
      review_status: reviewStatus,
      capture_photo: face_image.length < 500_000 ? face_image : null,
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
