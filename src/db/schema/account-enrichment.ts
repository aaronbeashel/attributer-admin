import { pgTable, uuid, varchar, text, integer, timestamp } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export const accountEnrichment = pgTable("account_enrichment", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().unique().references(() => accounts.id, { onDelete: "cascade" }),
  industry: varchar("industry"),
  subIndustry: varchar("sub_industry"),
  companySize: varchar("company_size"),
  signupPath: varchar("signup_path"),
  jobTitle: varchar("job_title"),
  jobDescription: text("job_description"),
  confidenceIndustry: integer("confidence_industry"),
  confidenceSize: integer("confidence_size"),
  confidencePath: integer("confidence_path"),
  enrichedAt: timestamp("enriched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AccountEnrichmentRow = typeof accountEnrichment.$inferSelect;
