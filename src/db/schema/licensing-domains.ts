import { pgTable, uuid, varchar, integer, boolean, text, timestamp } from "drizzle-orm/pg-core";

export const licensingDomains = pgTable("licensing_domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: varchar("domain").notNull().unique(),
  callCount: integer("call_count").notNull().default(0),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  isLicensed: boolean("is_licensed").notNull().default(false),
  isBlocked: boolean("is_blocked").notNull().default(false),
  scriptInstalled: boolean("script_installed"),
  scriptCheckedAt: timestamp("script_checked_at", { withTimezone: true }),
  checkError: varchar("check_error"),
  status: varchar("status").notNull().default("new"),
  accountId: uuid("account_id"),
  accountName: varchar("account_name"),
  accountEmail: varchar("account_email"),
  reviewNote: text("review_note"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: varchar("reviewed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LicensingDomain = typeof licensingDomains.$inferSelect;
