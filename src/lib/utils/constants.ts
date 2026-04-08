export const EVENT_TYPES = {
  // Account lifecycle
  ACCOUNT_CREATED: { type: "account", subtype: "created", label: "Account Created" },
  ACCOUNT_DELETED: { type: "account", subtype: "deleted", label: "Account Deleted" },

  // Auth events
  AUTH_SIGNUP: { type: "auth", subtype: "signup", label: "Signed Up" },
  AUTH_LOGIN: { type: "auth", subtype: "login", label: "Logged In" },
  AUTH_PASSWORD_RESET: { type: "auth", subtype: "password_reset", label: "Password Reset" },

  // Subscription events
  SUB_TRIAL_STARTED: { type: "subscription", subtype: "trial_started", label: "Trial Started" },
  SUB_TRIAL_CONVERTED: { type: "subscription", subtype: "trial_converted", label: "Trial Converted" },
  SUB_TRIAL_EXPIRED: { type: "subscription", subtype: "trial_expired", label: "Trial Expired" },
  SUB_PLAN_CHANGED: { type: "subscription", subtype: "plan_changed", label: "Plan Changed" },
  SUB_CANCELLED: { type: "subscription", subtype: "cancelled", label: "Subscription Cancelled" },
  SUB_REACTIVATED: { type: "subscription", subtype: "reactivated", label: "Subscription Reactivated" },
  SUB_DELINQUENT: { type: "subscription", subtype: "delinquent", label: "Became Delinquent" },

  // Site events
  SITE_ADDED: { type: "site", subtype: "added", label: "Site Added" },
  SITE_REMOVED: { type: "site", subtype: "removed", label: "Site Removed" },
  SITE_UPDATED: { type: "site", subtype: "updated", label: "Site Updated" },

  // Admin events
  ADMIN_IMPERSONATE: { type: "admin", subtype: "impersonate", label: "Admin Impersonated User" },
  ADMIN_PLAN_CHANGE: { type: "admin", subtype: "plan_change", label: "Admin Changed Plan" },
  ADMIN_TRIAL_EXTEND: { type: "admin", subtype: "trial_extend", label: "Admin Extended Trial" },
  ADMIN_CANCEL: { type: "admin", subtype: "cancel", label: "Admin Cancelled Subscription" },

  // Cron events
  CRON_ENRICHMENT: { type: "cron", subtype: "enrichment", label: "AI Enrichment Run" },
  CRON_TRIAL_CHECK: { type: "cron", subtype: "trial_check", label: "Trial Check Run" },
  CRON_DELINQUENCY_CHECK: { type: "cron", subtype: "delinquency_check", label: "Delinquency Check Run" },
} as const;

export const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  professional: "Professional",
  enterprise: "Enterprise",
};

export const STATUS_COLORS: Record<string, "success" | "warning" | "error" | "gray"> = {
  active: "success",
  trialing: "warning",
  cancelled: "error",
  past_due: "error",
  deactivated: "gray",
};

export const SUBSCRIPTION_STATUSES: Record<string, string> = {
  active: "Active",
  trialing: "Trialing",
  cancelled: "Cancelled",
  past_due: "Past Due",
  deactivated: "Deactivated",
};

export const CARDLESS_CONVERSION_RATE = 0.3;

export const SIGNUP_METHODS: Record<string, string> = {
  email: "Email",
  google: "Google",
  github: "GitHub",
};

export const SOURCE_LABELS: Record<string, string> = {
  system: "System",
  user: "User",
  admin: "Admin",
  cron: "Cron",
  stripe: "Stripe",
  webhook: "Webhook",
};
