import { Router } from "express";
import { pool, db, verificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function buildChild(row: any) {
  if (!row.c_id) return null;
  return {
    id: row.c_id,
    first_name: row.first_name,
    surname: row.surname,
    guardian_name: row.guardian_name,
    date_of_birth: row.date_of_birth,
    lga: row.lga,
    village: row.village,
    visible_marks: row.visible_marks,
    gps_lat: row.c_gps_lat,
    gps_lng: row.c_gps_lng,
    face_photo: row.face_photo,
    created_at: row.c_created_at?.toISOString() ?? null,
    verification_count: parseInt(row.vc ?? "0", 10),
  };
}

router.get("/review-queue", async (_req, res) => {
  const result = await pool.query(
    `SELECT v.*,
            c.id AS c_id, c.first_name, c.surname, c.guardian_name,
            c.date_of_birth, c.lga, c.village, c.visible_marks,
            c.gps_lat AS c_gps_lat, c.gps_lng AS c_gps_lng,
            c.face_photo, c.created_at AS c_created_at,
            (SELECT COUNT(*)::text FROM verifications v2 WHERE v2.child_id = c.id) AS vc
     FROM verifications v
     LEFT JOIN children c ON v.child_id = c.id
     WHERE v.review_status = 'needs_review'
     ORDER BY v.verified_at DESC`,
  );

  return res.json(
    result.rows.map((row: any) => ({
      verification_id: row.id,
      verified_at: row.verified_at.toISOString(),
      gps_lat: row.gps_lat,
      gps_lng: row.gps_lng,
      face_score: row.face_score,
      ear_score: row.ear_score,
      fused_score: row.fused_score,
      capture_photo: row.capture_photo,
      candidate_child: buildChild(row),
    })),
  );
});

router.get("/", async (req, res) => {
  const {
    review_status,
    lga,
    limit = "50",
    offset = "0",
  } = req.query as Record<string, string>;

  const [countRow, dataRows] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text FROM verifications v
       LEFT JOIN children c ON v.child_id = c.id
       WHERE ($1::text IS NULL OR v.review_status = $1)
         AND ($2::text IS NULL OR c.lga = $2)`,
      [review_status ?? null, lga ?? null],
    ),
    pool.query(
      `SELECT v.*,
              c.id AS c_id, c.first_name, c.surname, c.guardian_name,
              c.date_of_birth, c.lga, c.village, c.visible_marks,
              c.gps_lat AS c_gps_lat, c.gps_lng AS c_gps_lng,
              c.face_photo, c.created_at AS c_created_at,
              (SELECT COUNT(*)::text FROM verifications v2 WHERE v2.child_id = c.id) AS vc
       FROM verifications v
       LEFT JOIN children c ON v.child_id = c.id
       WHERE ($1::text IS NULL OR v.review_status = $1)
         AND ($2::text IS NULL OR c.lga = $2)
       ORDER BY v.verified_at DESC
       LIMIT $3 OFFSET $4`,
      [review_status ?? null, lga ?? null, parseInt(limit), parseInt(offset)],
    ),
  ]);

  return res.json({
    verifications: dataRows.rows.map((row: any) => ({
      id: row.id,
      child_id: row.child_id,
      verified_at: row.verified_at.toISOString(),
      gps_lat: row.gps_lat,
      gps_lng: row.gps_lng,
      face_score: row.face_score,
      ear_score: row.ear_score,
      fused_score: row.fused_score,
      review_status: row.review_status,
      child: buildChild(row),
    })),
    total: parseInt(countRow.rows[0].count, 10),
  });
});

router.patch("/:id/review", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { decision } = req.body ?? {};
  if (!["confirmed_match", "confirmed_new"].includes(decision)) {
    return res
      .status(400)
      .json({ error: "decision must be 'confirmed_match' or 'confirmed_new'" });
  }

  const rows = await db
    .update(verificationsTable)
    .set({ review_status: decision })
    .where(eq(verificationsTable.id, id))
    .returning();

  if (!rows[0]) return res.status(404).json({ error: "Verification not found" });

  const v = rows[0];
  return res.json({
    id: v.id,
    child_id: v.child_id,
    verified_at: v.verified_at.toISOString(),
    gps_lat: v.gps_lat,
    gps_lng: v.gps_lng,
    face_score: v.face_score,
    ear_score: v.ear_score,
    fused_score: v.fused_score,
    review_status: v.review_status,
    child: null,
  });
});

export default router;
