import { pgTable, serial, integer, real, text, timestamp } from "drizzle-orm/pg-core";
import { childrenTable } from "./children";

export const verificationsTable = pgTable("verifications", {
  id: serial("id").primaryKey(),
  child_id: integer("child_id").references(() => childrenTable.id),
  face_score: real("face_score"),
  ear_score: real("ear_score"),
  fused_score: real("fused_score"),
  review_status: text("review_status").notNull().default("clear"),
  capture_photo: text("capture_photo"),
  gps_lat: real("gps_lat"),
  gps_lng: real("gps_lng"),
  verified_at: timestamp("verified_at").defaultNow().notNull(),
});

export type Verification = typeof verificationsTable.$inferSelect;
