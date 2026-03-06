import { pgTable, uuid, varchar, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { betterAuthUsers } from "./users";

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name").notNull(),
  email: varchar("email").notNull(),
  company: varchar("company"),
  betterauthUserId: text("betterauth_user_id").notNull().references(() => betterAuthUsers.id),
  signupMethod: varchar("signup_method").notNull(),
  signupPathType: varchar("signup_path_type").notNull(),
  aiIndustry: varchar("ai_industry"),
  aiCompanySize: varchar("ai_company_size"),
  aiSignupPath: varchar("ai_signup_path"),
  aiConfidenceIndustry: integer("ai_confidence_industry"),
  aiConfidenceSize: integer("ai_confidence_size"),
  aiConfidencePath: integer("ai_confidence_path"),
  aiEnrichedAt: timestamp("ai_enriched_at", { withTimezone: true }),
  attrChannel: varchar("attr_channel"),
  attrChannelDrilldown1: varchar("attr_channel_drilldown1"),
  attrChannelDrilldown2: varchar("attr_channel_drilldown2"),
  attrChannelDrilldown3: varchar("attr_channel_drilldown3"),
  attrChannelDrilldown4: varchar("attr_channel_drilldown4"),
  attrLandingPage: text("attr_landing_page"),
  attrLandingPageGroup: varchar("attr_landing_page_group"),
  attrNumVisits: integer("attr_num_visits"),
  attrTimeToConversion: varchar("attr_time_to_conversion"),
  toolsSelectedAt: timestamp("tools_selected_at", { withTimezone: true }),
  planSelectedAt: timestamp("plan_selected_at", { withTimezone: true }),
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
  trialConvertedAt: timestamp("trial_converted_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
