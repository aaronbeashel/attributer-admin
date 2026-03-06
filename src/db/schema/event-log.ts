import { pgTable, uuid, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export const eventLog = pgTable("event_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").references(() => accounts.id),
  eventType: varchar("event_type").notNull(),
  eventSubtype: varchar("event_subtype"),
  metadata: jsonb("metadata"),
  source: varchar("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EventLogEntry = typeof eventLog.$inferSelect;
