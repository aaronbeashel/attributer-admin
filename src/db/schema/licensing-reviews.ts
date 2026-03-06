import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const licensingReviews = pgTable("licensing_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: varchar("domain").notNull(),
  action: varchar("action").notNull(), // 'blocked' | 'dismissed'
  reason: varchar("reason"),
  notes: text("notes"),
  actionedAt: timestamp("actioned_at", { withTimezone: true }).notNull().defaultNow(),
  actionedBy: varchar("actioned_by"),
});

export type LicensingReview = typeof licensingReviews.$inferSelect;
