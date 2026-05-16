import { Router } from "express";
import { pool, db, childrenTable, pendingRegistrationsTable, verificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { FaceMatchInputError, runFaceMatch, type AcceptedFaceFrame } from "../lib/face-matcher";

const router = Router();

const SORT_COLUMNS: Record<string, string> = {
  name: "(c.first_name || ' ' || c.surname)",
  created_at: "c.created_at",
  verification_count: "(SELECT COUNT(*) FROM verifications v2 WHERE v2.child_id = c.id)",
  lga: "c.lga",
  date_of_birth: "c.date_of_birth",
};

router.get("/", async (req, res) => {
  const {
    lga,
    village,
    search,
    limit = "50",
    offset = "0",
    dob_from,
    dob_to,
    registered_from,
    registered_to,
    verified_from,
    verified_to,
    sort_by = "created_at",
    sort_dir = "desc",
  } = req.query as Record<string, string>;

  const col = SORT_COLUMNS[sort_by] ?? "c.created_at";
  const dir = sort_dir === "asc" ? "ASC" : "DESC";

  const filterParams = [
    lga ?? null,                                                                         // $1
    village ?? null,                                                                     // $2
    search ?? null,                                                                      // $3
    dob_from ?? null,                                                                    // $4
    dob_to ?? null,                                                                      // $5
    registered_from ? new Date(registered_from).toISOString() : null,                   // $6
    registered_to ? new Date(registered_to + "T23:59:59Z").toISOString() : null,        // $7
    verified_from ? new Date(verified_from).toISOString() : null,                       // $8
    verified_to ? new Date(verified_to + "T23:59:59Z").toISOString() : null,            // $9
  ];

  const WHERE = `
    WHERE ($1::text IS NULL OR c.lga = $1)
      AND ($2::text IS NULL OR c.village ILIKE '%' || $2 || '%')
      AND ($3::text IS NULL OR (c.first_name || ' ' || c.surname) ILIKE '%' || $3 || '%')
      AND ($4::text IS NULL OR c.date_of_birth::date >= $4::date)
      AND ($5::text IS NULL OR c.date_of_birth::date <= $5::date)
      AND ($6::text IS NULL OR c.created_at >= $6::timestamptz)
      AND ($7::text IS NULL OR c.created_at <= $7::timestamptz)
      AND ($8::text IS NULL OR (
            SELECT MAX(v.verified_at) FROM verifications v WHERE v.child_id = c.id
          ) >= $8::timestamptz)
      AND ($9::text IS NULL OR (
            SELECT MAX(v.verified_at) FROM verifications v WHERE v.child_id = c.id
          ) <= $9::timestamptz)
  `;

  const [countRow, dataRows] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text FROM children c ${WHERE}`,
      filterParams,
    ),
    pool.query(
      `SELECT c.*,
              (SELECT COUNT(*)::text FROM verifications v WHERE v.child_id = c.id) AS verification_count
       FROM children c
       ${WHERE}
       ORDER BY ${col} ${dir}
       LIMIT $10 OFFSET $11`,
      [...filterParams, parseInt(limit), parseInt(offset)],
    ),
  ]);

  return res.json({
    children: dataRows.rows.map((c: any) => ({
      ...c,
      created_at: c.created_at.toISOString(),
      verification_count: parseInt(c.verification_count, 10),
    })),
    total: parseInt(countRow.rows[0].count, 10),
  });
});

async function loadChildRecord(childId: number) {
  const rows = await db
    .select()
    .from(childrenTable)
    .where(eq(childrenTable.id, childId))
    .limit(1);

  if (!rows[0]) return null;

  const vc = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text FROM verifications WHERE child_id = $1",
    [rows[0].id],
  );

  return {
    ...rows[0],
    created_at: rows[0].created_at.toISOString(),
    verification_count: parseInt(vc.rows[0].count, 10),
  };
}

function vecStr(v: number[]): string {
  return `[${v.join(",")}]`;
}

async function storeChildEmbeddings(childId: number, frames: AcceptedFaceFrame[]) {
  for (const frame of frames) {
    await pool.query(
      `INSERT INTO child_biometrics (child_id, photo_index, modality, embedding)
       VALUES ($1, $2, 'face', $3::vector)`,
      [childId, frame.photoIndex, vecStr(frame.embedding)],
    );
  }
}

router.post("/", async (req, res) => {
  const {
    first_name,
    surname,
    guardian_name,
    date_of_birth,
    lga,
    village,
    visible_marks,
    gps_lat,
    gps_lng,
    face_images,
  } = req.body ?? {};

  if (!first_name || !surname || !guardian_name || !date_of_birth || !lga || !village) {
    return res.status(400).json({ error: "Required personal details are missing" });
  }
  if (!Array.isArray(face_images) || face_images.length === 0) {
    return res.status(400).json({ error: "At least one face image is required" });
  }

  let match;
  try {
    match = await runFaceMatch(face_images, "register");
  } catch (error) {
    if (error instanceof FaceMatchInputError) {
      return res.status(error.status).json({
        error: error.message,
        error_code: error.errorCode,
      });
    }
    throw error;
  }

  const best = match.candidate;
  if (match.decision === "match" && best) {
    return res.status(409).json({
      error: "Likely duplicate registration detected",
      matched_child: await loadChildRecord(best.childId),
      confidence: best.score,
    });
  }

  const facePhoto =
    face_images[0] && face_images[0].length < 300_000 ? face_images[0] : null;

  if (match.decision === "review" && best) {
    const [verif] = await db
      .insert(verificationsTable)
      .values({
        child_id: best.childId,
        face_score: best.score,
        ear_score: null,
        fused_score: best.score,
        review_status: "needs_review",
        capture_photo: facePhoto,
        gps_lat: gps_lat ?? null,
        gps_lng: gps_lng ?? null,
      })
      .returning();

    const [pending] = await db
      .insert(pendingRegistrationsTable)
      .values({
        verification_id: verif.id,
        candidate_child_id: best.childId,
        first_name,
        surname,
        guardian_name,
        date_of_birth,
        lga,
        village,
        visible_marks: visible_marks ?? null,
        gps_lat: gps_lat ?? null,
        gps_lng: gps_lng ?? null,
        face_photo: facePhoto,
        embeddings: match.acceptedFrames.map((frame) => ({
          photo_index: frame.photoIndex,
          embedding: frame.embedding,
          det_score: frame.detScore,
        })),
        confidence: best.score,
      })
      .returning();

    return res.status(202).json({
      status: "needs_review",
      pending_registration_id: pending.id,
      verification_id: verif.id,
      matched_child: await loadChildRecord(best.childId),
      confidence: best.score,
    });
  }

  const [child] = await db
    .insert(childrenTable)
    .values({
      first_name,
      surname,
      guardian_name,
      date_of_birth,
      lga,
      village,
      visible_marks: visible_marks ?? null,
      gps_lat: gps_lat ?? null,
      gps_lng: gps_lng ?? null,
      face_photo: facePhoto,
    })
    .returning();

  await storeChildEmbeddings(child.id, match.acceptedFrames);

  return res.status(201).json({
    ...child,
    created_at: child.created_at.toISOString(),
    verification_count: 0,
  });
});

router.get("/:id/photos", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const result = await pool.query<{ face_photo: string | null; ear_photo: string | null }>(
    `SELECT face_photo, ear_photo FROM children WHERE id = $1`,
    [id],
  );

  if (!result.rows[0]) return res.status(404).json({ error: "Child not found" });

  const { face_photo, ear_photo } = result.rows[0];
  return res.json({ face_photo: face_photo ?? null, ear_photo: ear_photo ?? null });
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const result = await pool.query(
    `SELECT c.*,
            (SELECT COUNT(*)::text FROM verifications v WHERE v.child_id = c.id) AS verification_count
     FROM children c WHERE c.id = $1`,
    [id],
  );

  if (!result.rows[0]) return res.status(404).json({ error: "Child not found" });

  const c = result.rows[0];
  return res.json({
    ...c,
    created_at: c.created_at.toISOString(),
    verification_count: parseInt(c.verification_count, 10),
  });
});

export default router;
