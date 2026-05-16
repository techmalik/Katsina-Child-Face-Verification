import { pgTable, serial, integer, text, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { childrenTable } from "./children";
import { verificationsTable } from "./verifications";

export interface PendingRegistrationEmbedding {
  photo_index: number;
  embedding: number[];
  det_score: number;
}

export const pendingRegistrationsTable = pgTable("pending_registrations", {
  id: serial("id").primaryKey(),
  verification_id: integer("verification_id")
    .references(() => verificationsTable.id)
    .notNull(),
  candidate_child_id: integer("candidate_child_id").references(() => childrenTable.id),
  confirmed_child_id: integer("confirmed_child_id").references(() => childrenTable.id),
  status: text("status").notNull().default("needs_review"),
  first_name: text("first_name").notNull(),
  surname: text("surname").notNull(),
  guardian_name: text("guardian_name").notNull(),
  date_of_birth: text("date_of_birth").notNull(),
  lga: text("lga").notNull(),
  village: text("village").notNull(),
  visible_marks: text("visible_marks"),
  gps_lat: real("gps_lat"),
  gps_lng: real("gps_lng"),
  face_photo: text("face_photo"),
  embeddings: jsonb("embeddings").$type<PendingRegistrationEmbedding[]>().notNull(),
  confidence: real("confidence"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  resolved_at: timestamp("resolved_at"),
});

export type PendingRegistration = typeof pendingRegistrationsTable.$inferSelect;
