import { Router } from "express";
import { pool, db, childrenTable } from "@workspace/db";

const router = Router();
const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL ?? "http://localhost:8000";

router.get("/", async (req, res) => {
  const { lga, village, search, limit = "50", offset = "0" } = req.query as Record<string, string>;

  const [countRow, dataRows] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text FROM children
       WHERE ($1::text IS NULL OR lga = $1)
         AND ($2::text IS NULL OR village ILIKE '%' || $2 || '%')
         AND ($3::text IS NULL OR (first_name || ' ' || surname) ILIKE '%' || $3 || '%')`,
      [lga ?? null, village ?? null, search ?? null],
    ),
    pool.query(
      `SELECT c.*,
              (SELECT COUNT(*)::text FROM verifications v WHERE v.child_id = c.id) AS verification_count
       FROM children c
       WHERE ($1::text IS NULL OR c.lga = $1)
         AND ($2::text IS NULL OR c.village ILIKE '%' || $2 || '%')
         AND ($3::text IS NULL OR (c.first_name || ' ' || c.surname) ILIKE '%' || $3 || '%')
       ORDER BY c.created_at DESC
       LIMIT $4 OFFSET $5`,
      [lga ?? null, village ?? null, search ?? null, parseInt(limit), parseInt(offset)],
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
    ear_images,
  } = req.body ?? {};

  if (!first_name || !surname || !guardian_name || !date_of_birth || !lga || !village) {
    return res.status(400).json({ error: "Required personal details are missing" });
  }
  if (!Array.isArray(face_images) || face_images.length === 0) {
    return res.status(400).json({ error: "At least one face image is required" });
  }
  if (!Array.isArray(ear_images) || ear_images.length === 0) {
    return res.status(400).json({ error: "At least one ear image is required" });
  }

  let embResult: any;
  try {
    const resp = await fetch(`${FACE_SERVICE_URL}/embed/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ face_images, ear_images }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok) throw new Error(`Face service HTTP ${resp.status}`);
    embResult = await resp.json();
  } catch (err: any) {
    return res.status(503).json({ error: `Face service unavailable: ${err.message}` });
  }

  const facePhoto =
    face_images[0] && face_images[0].length < 300_000 ? face_images[0] : null;
  const earPhoto =
    ear_images[0] && ear_images[0].length < 300_000 ? ear_images[0] : null;

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
      ear_photo: earPhoto,
    })
    .returning();

  for (let i = 0; i < embResult.face_embeddings.length; i++) {
    if (embResult.face_detected[i]) {
      await pool.query(
        `INSERT INTO child_biometrics (child_id, photo_index, modality, embedding)
         VALUES ($1, $2, 'face', $3::vector)`,
        [child.id, i, `[${embResult.face_embeddings[i].join(",")}]`],
      );
    }
  }

  for (let i = 0; i < embResult.ear_embeddings.length; i++) {
    await pool.query(
      `INSERT INTO child_biometrics (child_id, photo_index, modality, embedding)
       VALUES ($1, $2, 'ear', $3::vector)`,
      [child.id, i, `[${embResult.ear_embeddings[i].join(",")}]`],
    );
  }

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
