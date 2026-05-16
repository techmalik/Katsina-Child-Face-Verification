import { Router } from "express";
import { pool, db, childrenTable, verificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { FaceMatchInputError, runFaceMatch } from "../lib/face-matcher";

const router = Router();

router.post("/", async (req, res) => {
  const { face_images, gps_lat, gps_lng } = req.body ?? {};

  let match;
  try {
    match = await runFaceMatch(face_images, "verify");
  } catch (error) {
    if (error instanceof FaceMatchInputError) {
      return res
        .status(error.status)
        .json({ error: error.message, error_code: error.errorCode });
    }
    throw error;
  }

  const status = match.decision;
  const best = match.candidate;
  let childRecord: Record<string, unknown> | null = null;

  if (status !== "new" && best) {
    const rows = await db
      .select()
      .from(childrenTable)
      .where(eq(childrenTable.id, best.childId))
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
      child_id: status !== "new" && best ? best.childId : null,
      face_score: best ? best.score : null,
      ear_score: null,
      fused_score: best ? best.score : null,
      review_status: reviewStatus,
      capture_photo: capturePhoto,
      gps_lat: gps_lat ?? null,
      gps_lng: gps_lng ?? null,
    })
    .returning();

  return res.json({
    status,
    confidence: best ? best.score : null,
    child: childRecord,
    verification_id: verif.id,
  });
});

export default router;
