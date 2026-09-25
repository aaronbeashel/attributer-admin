import { describe, it, expect, vi, beforeEach } from "vitest";

const { subsList, subsRetrieve, invoicesList } = vi.hoisted(() => ({
  subsList: vi.fn(),
  subsRetrieve: vi.fn(),
  invoicesList: vi.fn(),
}));

// The Stripe client is a module singleton, so mock the package itself.
vi.mock("stripe", () => ({
  default: class {
    subscriptions = { list: subsList, retrieve: subsRetrieve };
    invoices = { list: invoicesList };
  },
}));

import { getSubscriptionEndState, stripeShowsPaying } from "@/lib/stripe";

const DAY = 24 * 60 * 60;
const now = () => Math.floor(Date.now() / 1000);
const subs = (...items: Array<{ id: string; status: string }>) => ({ data: items });
const missing = () => Object.assign(new Error("No such customer"), { code: "resource_missing" });

describe("stripeShowsPaying", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoicesList.mockResolvedValue({ data: [] });
  });

  it("active pays", async () => {
    subsList.mockResolvedValueOnce(subs({ id: "sub_1", status: "active" }));
    expect(await stripeShowsPaying(["cus_1"])).toEqual({ paying: true, subscriptionId: "sub_1", status: "active", customerId: "cus_1" });
    expect(subsList).toHaveBeenCalledWith({ customer: "cus_1", status: "all", limit: 20 });
  });

  it("trialing pays", async () => {
    subsList.mockResolvedValueOnce(subs({ id: "sub_1", status: "canceled" }, { id: "sub_2", status: "trialing" }));
    expect(await stripeShowsPaying(["cus_1"])).toMatchObject({ paying: true, subscriptionId: "sub_2", status: "trialing" });
  });

  it("past_due with a paid invoice 20 days ago pays", async () => {
    subsList.mockResolvedValueOnce(subs({ id: "sub_1", status: "past_due" }));
    invoicesList.mockResolvedValueOnce({ data: [{ amount_paid: 4900, created: now() - 20 * DAY }] });
    expect(await stripeShowsPaying(["cus_1"])).toMatchObject({ paying: true, status: "past_due" });
    const args = invoicesList.mock.calls[0][0];
    expect(args).toMatchObject({ customer: "cus_1", status: "paid", limit: 12 });
    expect(args.created.gte).toBeGreaterThan(now() - 401 * DAY);
    expect(args.created.gte).toBeLessThan(now() - 399 * DAY);
  });

  it("past_due with the last paid invoice 500 days ago doesn't pay", async () => {
    subsList.mockResolvedValueOnce(subs({ id: "sub_1", status: "past_due" }));
    invoicesList.mockResolvedValueOnce({ data: [{ amount_paid: 4900, created: now() - 500 * DAY }] });
    expect(await stripeShowsPaying(["cus_1"])).toEqual({ paying: false });
  });

  it("past_due with no paid invoices doesn't pay", async () => {
    subsList.mockResolvedValueOnce(subs({ id: "sub_1", status: "past_due" }));
    invoicesList.mockResolvedValueOnce({ data: [] });
    expect(await stripeShowsPaying(["cus_1"])).toEqual({ paying: false });
  });

  it("past_due with only zero-amount paid invoices doesn't pay", async () => {
    subsList.mockResolvedValueOnce(subs({ id: "sub_1", status: "past_due" }));
    invoicesList.mockResolvedValueOnce({ data: [{ amount_paid: 0, created: now() - 5 * DAY }] });
    expect(await stripeShowsPaying(["cus_1"])).toEqual({ paying: false });
  });

  it("skips a customer Stripe no longer has", async () => {
    subsList.mockRejectedValueOnce(missing()).mockResolvedValueOnce(subs({ id: "sub_2", status: "active" }));
    expect(await stripeShowsPaying(["cus_gone", "cus_2"])).toMatchObject({ paying: true, customerId: "cus_2" });
  });

  it("is not paying when every customer is missing or cancelled", async () => {
    subsList.mockRejectedValueOnce(missing()).mockResolvedValueOnce(subs({ id: "sub_2", status: "canceled" }));
    expect(await stripeShowsPaying(["cus_gone", "cus_2"])).toEqual({ paying: false });
  });

  it("throws on any other error", async () => {
    subsList.mockRejectedValueOnce(Object.assign(new Error("rate limited"), { code: "rate_limit" }));
    await expect(stripeShowsPaying(["cus_1"])).rejects.toThrow("rate limited");
  });

  it("asks about each customer only once", async () => {
    subsList.mockResolvedValue(subs());
    await stripeShowsPaying(["cus_1", "cus_1", ""]);
    expect(subsList).toHaveBeenCalledTimes(1);
  });
});

describe("getSubscriptionEndState", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is canceled for a canceled subscription", async () => {
    subsRetrieve.mockResolvedValueOnce({ status: "canceled", cancel_at_period_end: false });
    expect(await getSubscriptionEndState("sub_1")).toBe("canceled");
  });

  it("is ending for cancel at period end", async () => {
    subsRetrieve.mockResolvedValueOnce({ status: "active", cancel_at_period_end: true });
    expect(await getSubscriptionEndState("sub_1")).toBe("ending");
  });

  it("is live otherwise", async () => {
    subsRetrieve.mockResolvedValueOnce({ status: "active", cancel_at_period_end: false });
    expect(await getSubscriptionEndState("sub_1")).toBe("live");
  });

  it("treats a missing subscription as canceled", async () => {
    subsRetrieve.mockRejectedValueOnce(missing());
    expect(await getSubscriptionEndState("sub_1")).toBe("canceled");
  });

  it("throws on any other error", async () => {
    subsRetrieve.mockRejectedValueOnce(new Error("network"));
    await expect(getSubscriptionEndState("sub_1")).rejects.toThrow("network");
  });
});
