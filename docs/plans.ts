export interface PlanPricing {
  amount_cents: number;
  stripe_price_id: string;
}

export interface PlanDefinition {
  id: string;
  name: string;
  type: "single" | "multisite";
  site_limit: number;
  lead_limit: number | null; // null = unlimited
  cardless_trial_allowed: boolean;
  pricing: Record<string, PlanPricing>; // monthly, keyed by currency code
  annualPricing?: Record<string, PlanPricing>; // annual (2 months free), keyed by currency code
}

export const PLANS: Record<string, PlanDefinition> = {
  lite: {
    id: "lite",
    name: "Lite",
    type: "single",
    site_limit: 1,
    lead_limit: 100,
    cardless_trial_allowed: true,
    pricing: {
      usd: {
        amount_cents: 2900,
        stripe_price_id: process.env.STRIPE_PRICE_LITE_USD || "price_lite_usd",
      },
    },
    annualPricing: {
      usd: {
        amount_cents: 29000, // $290/year (2 months free)
        stripe_price_id: process.env.STRIPE_PRICE_LITE_ANNUAL_USD || "price_lite_annual_usd",
      },
    },
  },
  starter: {
    id: "starter",
    name: "Starter",
    type: "single",
    site_limit: 1,
    lead_limit: 500,
    cardless_trial_allowed: true,
    pricing: {
      usd: {
        amount_cents: 4900,
        stripe_price_id: process.env.STRIPE_PRICE_STARTER_USD || "price_starter_usd",
      },
    },
    annualPricing: {
      usd: {
        amount_cents: 49000, // $490/year (2 months free)
        stripe_price_id: process.env.STRIPE_PRICE_STARTER_ANNUAL_USD || "price_starter_annual_usd",
      },
    },
  },
  professional: {
    id: "professional",
    name: "Pro",
    type: "single",
    site_limit: 1,
    lead_limit: 1000,
    cardless_trial_allowed: true,
    pricing: {
      usd: {
        amount_cents: 9900,
        stripe_price_id: process.env.STRIPE_PRICE_PROFESSIONAL_USD || "price_professional_usd",
      },
    },
    annualPricing: {
      usd: {
        amount_cents: 99000, // $990/year (2 months free)
        stripe_price_id: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL_USD || "price_professional_annual_usd",
      },
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    type: "single",
    site_limit: 1,
    lead_limit: null,
    cardless_trial_allowed: true,
    pricing: {
      usd: {
        amount_cents: 0, // calculated dynamically: $100 per 1,000 leads
        stripe_price_id: process.env.STRIPE_PRICE_ENTERPRISE_USD || "price_enterprise_usd",
      },
    },
    annualPricing: {
      usd: {
        amount_cents: 0, // calculated dynamically: $100 per 1,000 leads, billed annually
        stripe_price_id: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL_USD || "price_enterprise_annual_usd",
      },
    },
  },
  multisite_10: {
    id: "multisite_10",
    name: "10 Sites",
    type: "multisite",
    site_limit: 10,
    lead_limit: null, // unlimited per site
    cardless_trial_allowed: false,
    pricing: {
      usd: {
        amount_cents: 19900,
        stripe_price_id: process.env.STRIPE_PRICE_MULTISITE_10_USD || "price_multisite_10_usd",
      },
    },
  },
  multisite_25: {
    id: "multisite_25",
    name: "25 Sites",
    type: "multisite",
    site_limit: 25,
    lead_limit: null,
    cardless_trial_allowed: false,
    pricing: {
      usd: {
        amount_cents: 29900,
        stripe_price_id: process.env.STRIPE_PRICE_MULTISITE_25_USD || "price_multisite_25_usd",
      },
    },
  },
  multisite_50: {
    id: "multisite_50",
    name: "50 Sites",
    type: "multisite",
    site_limit: 50,
    lead_limit: null,
    cardless_trial_allowed: false,
    pricing: {
      usd: {
        amount_cents: 39900,
        stripe_price_id: process.env.STRIPE_PRICE_MULTISITE_50_USD || "price_multisite_50_usd",
      },
    },
  },
};

export function getPlanById(planId: string): PlanDefinition | undefined {
  return PLANS[planId];
}

export function getPlanByPriceId(stripePriceId: string): PlanDefinition | undefined {
  return Object.values(PLANS).find((plan) =>
    Object.values(plan.pricing).some((p) => p.stripe_price_id === stripePriceId)
  );
}

export function getPrice(
  plan: PlanDefinition,
  currency: string = "usd"
): PlanPricing {
  return plan.pricing[currency.toLowerCase()] || plan.pricing.usd;
}

export function getSingleSitePlans(): PlanDefinition[] {
  return Object.values(PLANS).filter((p) => p.type === "single");
}

export function getPriceForBillingPeriod(
  plan: PlanDefinition,
  billingPeriod: "monthly" | "annual",
  currency: string = "usd"
): PlanPricing {
  if (billingPeriod === "annual" && plan.annualPricing) {
    return plan.annualPricing[currency.toLowerCase()] ?? plan.annualPricing.usd;
  }
  return getPrice(plan, currency);
}

export function getMultisitePlans(): PlanDefinition[] {
  return Object.values(PLANS).filter((p) => p.type === "multisite");
}
