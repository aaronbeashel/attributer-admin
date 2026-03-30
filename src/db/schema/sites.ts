import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id),
  name: varchar("name").notNull(),
  domain: varchar("domain"),
  websiteUrl: text("website_url"),
  cms: varchar("cms"),
  formTool: varchar("form_tool"),
  crm: varchar("crm"),
  isDefault: boolean("is_default").notNull(),
  status: varchar("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  cmsOther: varchar("cms_other"),
  formToolOther: varchar("form_tool_other"),
  crmOther: varchar("crm_other"),
});

export type Site = typeof sites.$inferSelect;
