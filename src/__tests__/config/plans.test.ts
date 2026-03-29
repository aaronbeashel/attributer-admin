import { describe, it, expect } from "vitest";
import {
  getPlanById,
  getPlanByPriceId,
  getPriceForBillingPeriod,
  getSingleSitePlans,
  getMultisitePlans,
  PLANS,
} from "@/config/plans";

describe("getPlanById", () => {
  it("returns plan for valid ID", () => {
    const plan = getPlanById("starter");
    expect(plan).toBeDefined();
    expect(plan!.name).toBe("Starter");
    expect(plan!.lead_limit).toBe(500);
    expect(plan!.site_limit).toBe(1);
  });

  it("returns undefined for invalid ID", () => {
    expect(getPlanById("nonexistent")).toBeUndefined();
  });

  it("returns enterprise plan with null lead_limit", () => {
    const plan = getPlanById("enterprise");
    expect(plan).toBeDefined();
    expect(plan!.lead_limit).toBeNull();
  });

  it("returns all expected plans", () => {
    const expectedIds = ["lite", "starter", "professional", "enterprise", "multisite_10", "multisite_25", "multisite_50"];
    for (const id of expectedIds) {
      expect(getPlanById(id)).toBeDefined();
    }
  });
});

describe("getPriceForBillingPeriod", () => {
  it("returns monthly pricing by default", () => {
    const plan = getPlanById("starter")!;
    const price = getPriceForBillingPeriod(plan, "monthly");
    expect(price.amount_cents).toBe(4900);
  });

  it("returns annual pricing when available", () => {
    const plan = getPlanById("starter")!;
    const price = getPriceForBillingPeriod(plan, "annual");
    expect(price.amount_cents).toBe(49000);
  });

  it("falls back to monthly when no annual pricing exists", () => {
    const plan = getPlanById("multisite_10")!;
    const price = getPriceForBillingPeriod(plan, "annual");
    // multisite_10 has no annualPricing, should fall back to monthly
    expect(price.amount_cents).toBe(19900);
  });

  it("returns correct pricing for each plan tier", () => {
    expect(getPriceForBillingPeriod(getPlanById("lite")!, "monthly").amount_cents).toBe(2900);
    expect(getPriceForBillingPeriod(getPlanById("professional")!, "monthly").amount_cents).toBe(9900);
    expect(getPriceForBillingPeriod(getPlanById("multisite_25")!, "monthly").amount_cents).toBe(29900);
    expect(getPriceForBillingPeriod(getPlanById("multisite_50")!, "monthly").amount_cents).toBe(39900);
  });
});

describe("getSingleSitePlans", () => {
  it("returns only single-site plans", () => {
    const plans = getSingleSitePlans();
    expect(plans.every((p) => p.type === "single")).toBe(true);
    expect(plans).toHaveLength(4);
  });

  it("includes lite, starter, professional, enterprise", () => {
    const ids = getSingleSitePlans().map((p) => p.id);
    expect(ids).toContain("lite");
    expect(ids).toContain("starter");
    expect(ids).toContain("professional");
    expect(ids).toContain("enterprise");
  });
});

describe("getMultisitePlans", () => {
  it("returns only multisite plans", () => {
    const plans = getMultisitePlans();
    expect(plans.every((p) => p.type === "multisite")).toBe(true);
    expect(plans).toHaveLength(3);
  });
});

describe("getPlanByPriceId", () => {
  it("finds plan by monthly Stripe price ID", () => {
    const starterPriceId = PLANS.starter.pricing.usd.stripe_price_id;
    const plan = getPlanByPriceId(starterPriceId);
    expect(plan?.id).toBe("starter");
  });

  it("returns undefined for unknown price ID", () => {
    expect(getPlanByPriceId("price_nonexistent")).toBeUndefined();
  });
});
