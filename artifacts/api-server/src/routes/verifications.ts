import { Router } from "express";
import {
  pool,
  db,
  childrenTable,
  verificationsTable,
  pendingRegistrationsTable,
  type PendingRegistrationEmbedding,
} from "@workspace/db";
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
    ear_photo: row.ear_photo,
    created_at: row.c_created_at?.toISOString() ?? null,
    verification_count: parseInt(row.vc ?? "0", 10),
  };
}

async function loadChildRecord(childId: number) {
  const result = await pool.query(
    `SELECT c.*,
            (SELECT COUNT(*)::text FROM verifications v WHERE v.child_id = c.id) AS verification_count
     FROM children c WHERE c.id = $1`,
    [childId],
  );

  const child = result.rows[0];
  if (!child) return null;

  return {
    ...child,
    created_at: child.created_at.toISOString(),
    verification_count: parseInt(child.verification_count, 10),
  };
}

function vecStr(v: number[]): string {
  return `[${v.join(",")}]`;
}

async function storePendingEmbeddings(childId: number, embeddings: PendingRegistrationEmbedding[]) {
  for (const item of embeddings) {
    await pool.query(
      `INSERT INTO child_biometrics (child_id, photo_index, modality, embedding)
       VALUES ($1, $2, 'face', $3::vector)`,
      [childId, item.photo_index, vecStr(item.embedding)],
    );
  }
}

router.get("/review-queue", async (_req, res) => {
  const result = await pool.query(
    `SELECT v.*,
            pr.id AS pending_registration_id,
            c.id AS c_id, c.first_name, c.surname, c.guardian_name,
            c.date_of_birth, c.lga, c.village, c.visible_marks,
            c.gps_lat AS c_gps_lat, c.gps_lng AS c_gps_lng,
            c.face_photo, c.ear_photo, c.created_at AS c_created_at,
            (SELECT COUNT(*)::text FROM verifications v2 WHERE v2.child_id = c.id) AS vc
     FROM verifications v
     LEFT JOIN pending_registrations pr ON pr.verification_id = v.id
     LEFT JOIN children c ON v.child_id = c.id
     WHERE v.review_status = 'needs_review'
     ORDER BY v.verified_at DESC`,
  );

  return res.json(
    result.rows.map((row: any) => ({
      verification_id: row.id,
      pending_registration_id: row.pending_registration_id,
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
              c.face_photo, c.ear_photo, c.created_at AS c_created_at,
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

router.delete("/", async (req, res) => {
  if (req.headers["x-confirm-delete"] !== "true") {
    return res
      .status(400)
      .json({ error: "Missing required header: X-Confirm-Delete: true" });
  }
  const result = await pool.query("DELETE FROM verifications");
  return res.json({ deleted: result.rowCount ?? 0 });
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

  const pendingRows = await db
    .select()
    .from(pendingRegistrationsTable)
    .where(eq(pendingRegistrationsTable.verification_id, id))
    .limit(1);

  const pending = pendingRows[0] ?? null;
  let confirmedChildId: number | null = null;

  if (pending && pending.status === "needs_review" && decision === "confirmed_new") {
    const [child] = await db
      .insert(childrenTable)
      .values({
        first_name: pending.first_name,
        surname: pending.surname,
        guardian_name: pending.guardian_name,
        date_of_birth: pending.date_of_birth,
        lga: pending.lga,
        village: pending.village,
        visible_marks: pending.visible_marks,
        gps_lat: pending.gps_lat,
        gps_lng: pending.gps_lng,
        face_photo: pending.face_photo,
      })
      .returning();

    confirmedChildId = child.id;
    await storePendingEmbeddings(child.id, pending.embeddings);

    await db
      .update(pendingRegistrationsTable)
      .set({
        status: "confirmed_new",
        confirmed_child_id: child.id,
        resolved_at: new Date(),
      })
      .where(eq(pendingRegistrationsTable.id, pending.id));
  } else if (pending && pending.status === "needs_review" && decision === "confirmed_match") {
    await db
      .update(pendingRegistrationsTable)
      .set({
        status: "confirmed_match",
        resolved_at: new Date(),
      })
      .where(eq(pendingRegistrationsTable.id, pending.id));
  }

  const verificationUpdate =
    confirmedChildId === null
      ? { review_status: decision }
      : { review_status: decision, child_id: confirmedChildId };

  const rows = await db
    .update(verificationsTable)
    .set(verificationUpdate)
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
    child: v.child_id ? await loadChildRecord(v.child_id) : null,
  });
});

export default router;
