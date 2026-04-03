import { pgTable, uuid, varchar, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const licensingScans = pgTable("licensing_scans", {
  id: uuid("id").primaryKey().defaultRandom(),
  scanType: varchar("scan_type").notNull(),
  totalRows: integer("total_rows").notNull(),
  uniqueDomains: integer("unique_domains").notNull(),
  unlicensedCount: integer("unlicensed_count").notNull(),
  results: jsonb("results").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LicensingScan = typeof licensingScans.$inferSelect;
