import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set before initializing the database.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  console.log("Database extension ready: vector");
} finally {
  await pool.end();
}
