import { Router } from "express";
import { pool, db, childrenTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();
const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL ?? "http://localhost:8000";
const THRESHOLD_DUPLICATE = 0.38;

function vecStr(v: number[]): string {
  return `[${v.join(",")}]`;
}

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
  } = req.body ?? {};

  if (!first_name || !surname || !guardian_name || !date_of_birth || !lga || !village) {
    return res.status(400).json({ error: "Required personal details are missing" });
  }
  if (!Array.isArray(face_images) || face_images.length === 0) {
    return res.status(400).json({ error: "At least one face image is required" });
  }

  let embResult: any;
  try {
    const resp = await fetch(`${FACE_SERVICE_URL}/embed/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ face_images }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok) throw new Error(`Face service HTTP ${resp.status}`);
    embResult = await resp.json();
  } catch (err: any) {
    return res.status(503).json({ error: `Face service unavailable: ${err.message}` });
  }

  const faceEmb = embResult.face_embeddings[0] as number[] | undefined;

  if (!faceEmb || !embResult.face_detected[0]) {
    return res
      .status(400)
      .json({ error: "No face detected in the face photo. Please retake in good light." });
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
  if (best) {
    const faceSim = Math.max(0, 1 - best.face_dist);

    if (faceSim >= THRESHOLD_DUPLICATE) {
      const rows = await db
        .select()
        .from(childrenTable)
        .where(eq(childrenTable.id, best.child_id))
        .limit(1);
      let matchedChild = null;
      if (rows[0]) {
        const vc = await pool.query<{ count: string }>(
          "SELECT COUNT(*)::text FROM verifications WHERE child_id = $1",
          [rows[0].id],
        );
        matchedChild = {
          ...rows[0],
          created_at: rows[0].created_at.toISOString(),
          verification_count: parseInt(vc.rows[0].count, 10),
        };
      }
      return res.status(409).json({
        error: "Likely duplicate registration detected",
        matched_child: matchedChild,
        confidence: faceSim,
      });
    }
  }

  const facePhoto =
    face_images[0] && face_images[0].length < 300_000 ? face_images[0] : null;

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
      ear_photo: null,
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
