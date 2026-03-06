import { pgTable, uuid, varchar, text, integer, timestamp } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  planId: varchar("plan_id").notNull(),
  planName: varchar("plan_name").notNull(),
  planPriceCents: integer("plan_price_cents").notNull(),
  planCurrency: varchar("plan_currency").notNull(),
  status: varchar("status").notNull(),
  trialType: varchar("trial_type"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  siteLimit: integer("site_limit").notNull(),
  leadLimit: integer("lead_limit"),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  delinquentSince: timestamp("delinquent_since", { withTimezone: true }),
  cancellationReason: varchar("cancellation_reason"),
  cancellationFeedback: text("cancellation_feedback"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Subscription = typeof subscriptions.$inferSelect;
