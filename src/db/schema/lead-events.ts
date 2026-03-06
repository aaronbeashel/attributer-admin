import { pgTable, uuid, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";
import { sites } from "./sites";

export const leadEvents = pgTable("lead_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  domain: varchar("domain"),
  eventType: varchar("event_type").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LeadEvent = typeof leadEvents.$inferSelect;
