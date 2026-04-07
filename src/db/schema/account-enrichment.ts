import { pgTable, uuid, varchar, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export const accountEnrichment = pgTable("account_enrichment", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().unique().references(() => accounts.id, { onDelete: "cascade" }),

  // Company classification
  industry: varchar("industry"),
  subIndustry: varchar("sub_industry"),
  companySize: varchar("company_size"),
  signupPath: varchar("signup_path"),
  employeeCount: integer("employee_count"),
  companyDescription: text("company_description"),
  companyLinkedinUrl: varchar("company_linkedin_url"),

  // Person information
  jobTitleRaw: varchar("job_title_raw"),
  jobRole: varchar("job_role"),
  seniorityLevel: varchar("seniority_level"),
  personDescription: text("person_description"),
  personLocation: varchar("person_location"),
  personLinkedinUrl: varchar("person_linkedin_url"),
  yearsExperience: integer("years_experience"),

  // Signup analysis
  emailDomain: varchar("email_domain"),
  domainsMatch: boolean("domains_match"),

  // Confidence scores
  confidenceIndustry: integer("confidence_industry"),
  confidenceSize: integer("confidence_size"),
  confidencePath: integer("confidence_path"),
  confidencePerson: integer("confidence_person"),

  enrichedAt: timestamp("enriched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AccountEnrichmentRow = typeof accountEnrichment.$inferSelect;
