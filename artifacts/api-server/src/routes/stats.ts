import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

const KATSINA_LGAS = [
  "Bakori", "Batagarawa", "Batsari", "Baure", "Bindawa", "Charanchi",
  "Dan Musa", "Dandume", "Danja", "Daura", "Dutsi", "Dutsin Ma",
  "Faskari", "Funtua", "Ingawa", "Jibia", "Kafur", "Kaita",
  "Kankara", "Kankia", "Katsina", "Kurfi", "Kusada", "Mai'adua",
  "Malumfashi", "Mani", "Mashi", "Matazu", "Musawa", "Rimi",
  "Sabuwa", "Safana", "Sandamu", "Zango",
];

router.get("/stats", async (_req, res) => {
  const [totals, byLga] = await Promise.all([
    pool.query<{
      total_children: string;
      verifications_today: string;
      verifications_this_week: string;
      pending_reviews: string;
    }>(
      `SELECT
         (SELECT COUNT(*)::text FROM children) AS total_children,
         (SELECT COUNT(*)::text FROM verifications WHERE verified_at >= CURRENT_DATE) AS verifications_today,
         (SELECT COUNT(*)::text FROM verifications WHERE verified_at >= CURRENT_DATE - INTERVAL '7 days') AS verifications_this_week,
         (SELECT COUNT(*)::text FROM verifications WHERE review_status = 'needs_review') AS pending_reviews`,
    ),
    pool.query<{ lga: string; count: string }>(
      `SELECT c.lga, COUNT(v.id)::text AS count
       FROM children c
       LEFT JOIN verifications v ON v.child_id = c.id
       GROUP BY c.lga`,
    ),
  ]);

  const byLgaMap: Record<string, number> = {};
  for (const row of byLga.rows) {
    byLgaMap[row.lga] = parseInt(row.count, 10);
  }

  const row = totals.rows[0];
  return res.json({
    total_children: parseInt(row.total_children, 10),
    verifications_today: parseInt(row.verifications_today, 10),
    verifications_this_week: parseInt(row.verifications_this_week, 10),
    pending_reviews: parseInt(row.pending_reviews, 10),
    verifications_by_lga: byLgaMap,
  });
});

router.get("/lgas", (_req, res) => {
  return res.json(
    KATSINA_LGAS.map((name) => ({
      name,
      code: name.toUpperCase().replace(/[^A-Z0-9]/g, "_"),
    })),
  );
});

export default router;
