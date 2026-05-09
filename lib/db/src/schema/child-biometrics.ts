import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { customType } from "drizzle-orm/pg-core";
import { childrenTable } from "./children";

/**
 * Custom pgvector type for 512-dimensional float embeddings.
 * Stored as vector(512) in PostgreSQL (requires pgvector extension).
 */
export const vector512 = customType<{ data: number[] }>({
  dataType() {
    return "vector(512)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    if (typeof value === "string") {
      return value
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map(Number);
    }
    return value as number[];
  },
});

export const childBiometricsTable = pgTable("child_biometrics", {
  id: serial("id").primaryKey(),
  child_id: integer("child_id")
    .references(() => childrenTable.id)
    .notNull(),
  photo_index: integer("photo_index").notNull(),
  modality: text("modality").notNull(),
  embedding: vector512("embedding").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export type ChildBiometric = typeof childBiometricsTable.$inferSelect;
