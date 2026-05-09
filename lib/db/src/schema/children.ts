import { pgTable, serial, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const childrenTable = pgTable("children", {
  id: serial("id").primaryKey(),
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
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertChildSchema = createInsertSchema(childrenTable).omit({
  id: true,
  created_at: true,
});

export type InsertChild = z.infer<typeof insertChildSchema>;
export type Child = typeof childrenTable.$inferSelect;
