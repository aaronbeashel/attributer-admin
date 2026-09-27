import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stripe", () => ({
  stripeShowsPaying: vi.fn(),
  getSubscriptionEndState: vi.fn(),
}));

import { checkBlockAllowed } from "@/lib/licensing/block-guard";
import { getSubscriptionEndState, stripeShowsPaying } from "@/lib/stripe";
import { createFakeLicensingDb } from "../../__mocks__/licensing-db";

type Row = Record<string, unknown>;

const account = (id: string, email: string, cancelled_at: string | null = null) => ({ id, name: `${id} name`, email, cancelled_at });
const sub = (account_id: string, status: string, extra: Row = {}) => ({
  account_id,
  status,
  created_at: "2026-01-01T00:00:00Z",
  plan_name: "Starter",
  stripe_customer_id: `cus_${account_id}`,
  stripe_subscription_id: `sub_${account_id}`,
  ...extra,
});
let seq = 0;
const site = (account_id: string, domain: string | null, status = "active") => ({ id: `site_${++seq}`, account_id, domain, status });

function db(tables: { sites?: Row[]; accounts?: Row[]; subscriptions?: Row[]; licensing_domains?: Row[] }, failTables: string[] = []) {
  return createFakeLicensingDb(
    { sites: [], accounts: [], subscriptions: [], licensing_domains: [], ...tables },
    { failTables }
  ) as never;
}

describe("checkBlockAllowed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(stripeShowsPaying).mockResolvedValue({ paying: false });
    vi.mocked(getSubscriptionEndState).mockResolvedValue("live");
  });

  it.each(["", "   ", "not a domain", "com", "co.uk", "a..com", ".acme.com", "bad,domain.com", "acme_site.com"])(
    "refuses %j as invalid (400)",
    async (domain) => {
      expect(await checkBlockAllowed(db({}), domain)).toEqual({
        ok: false,
        status: 400,
        error: "Not blocked. That isn't a valid domain.",
      });
    }
  );

  it("refuses a shared host (409)", async () => {
    for (const domain of ["acme.webflow.io", "webflow.io", "https://www.foo.wpengine.com"]) {
      const result = await checkBlockAllowed(db({}), domain);
      expect(result).toMatchObject({ ok: false, status: 409 });
      expect(!result.ok && result.error).toMatch(/is a shared hosting address used by many customers\.$/);
    }
  });

  it("refuses a paying owner's active site on the domain (409)", async () => {
    const result = await checkBlockAllowed(
      db({ sites: [site("acc_1", "acme.com")], accounts: [account("acc_1", "ops@acme.com")], subscriptions: [sub("acc_1", "active")] }),
      "https://www.acme.com/"
    );
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "Not blocked. acme.com belongs to a paying customer (ops@acme.com, Starter).",
    });
  });

  it("refuses when a paying customer owns a sibling on the same root (409)", async () => {
    const result = await checkBlockAllowed(
      db({
        sites: [site("acc_dr", "lp.clinicdrayana.com")],
        accounts: [account("acc_dr", "dr@clinicdrayana.com")],
        subscriptions: [sub("acc_dr", "past_due")],
      }),
      "sports.clinicdrayana.com"
    );
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "Not blocked. lp.clinicdrayana.com belongs to a paying customer (dr@clinicdrayana.com, Starter).",
    });
  });

  it("allows a paying owner's removed site when they still have another active site", async () => {
    const result = await checkBlockAllowed(
      db({
        sites: [site("acc_1", "old.com", "inactive"), site("acc_1", "current.com")],
        accounts: [account("acc_1", "ops@current.com")],
        subscriptions: [sub("acc_1", "active")],
      }),
      "old.com"
    );
    expect(result).toEqual({ ok: true, domain: "old.com" });
    expect(stripeShowsPaying).not.toHaveBeenCalled();
  });

  it("refuses a paying owner's suspended site with the suspended copy (409)", async () => {
    const result = await checkBlockAllowed(
      db({
        sites: [site("acc_1", "acme.com", "suspended"), site("acc_1", "other.com")],
        accounts: [account("acc_1", "ops@acme.com")],
        subscriptions: [sub("acc_1", "active")],
      }),
      "acme.com"
    );
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "Not blocked. ops@acme.com pays for Attributer but their site acme.com is suspended. Fix the site before blocking.",
    });
  });

  it("refuses a paying account with no active sites anywhere (409)", async () => {
    const result = await checkBlockAllowed(
      db({
        sites: [site("acc_cn", "codeninjas.com", "inactive"), site("acc_cn", "cn-two.com", "inactive")],
        accounts: [account("acc_cn", "ops@codeninjas.com")],
        subscriptions: [sub("acc_cn", "active")],
      }),
      "codeninjas.com"
    );
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "Not blocked. ops@codeninjas.com pays for Attributer but has no active sites. Check the account before blocking.",
    });
  });

  it("counts an active site with no domain as an active site", async () => {
    const result = await checkBlockAllowed(
      db({
        sites: [site("acc_1", "acme.com", "inactive"), site("acc_1", null, "active")],
        accounts: [account("acc_1", "ops@acme.com")],
        subscriptions: [sub("acc_1", "active")],
      }),
      "acme.com"
    );
    expect(result).toEqual({ ok: true, domain: "acme.com" });
  });

  it("refuses a non-paying owner that Stripe shows paying (409)", async () => {
    vi.mocked(stripeShowsPaying).mockResolvedValue({ paying: true, status: "active", customerId: "cus_acc_1", subscriptionId: "sub_x" });
    const result = await checkBlockAllowed(
      db({ sites: [site("acc_1", "magmio.com")], accounts: [account("acc_1", "ops@magmio.com")], subscriptions: [sub("acc_1", "deactivated")] }),
      "magmio.com"
    );
    expect(stripeShowsPaying).toHaveBeenCalledWith(["cus_acc_1"]);
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "Not blocked. Stripe shows ops@magmio.com is still paying (active). Check their account first.",
    });
  });

  it("checks Stripe for the account stored on the domain's licensing row", async () => {
    vi.mocked(stripeShowsPaying).mockResolvedValue({ paying: true, status: "past_due", customerId: "cus_acc_linked" });
    const result = await checkBlockAllowed(
      db({
        accounts: [account("acc_linked", "linked@else.com")],
        subscriptions: [sub("acc_linked", "cancelled")],
        licensing_domains: [{ domain: "stranger.com", account_id: "acc_linked" }],
      }),
      "stranger.com"
    );
    expect(stripeShowsPaying).toHaveBeenCalledWith(["cus_acc_linked"]);
    expect(result).toMatchObject({ ok: false, status: 409 });
  });

  it("fails closed when Stripe throws (503)", async () => {
    vi.mocked(stripeShowsPaying).mockRejectedValue(new Error("stripe down"));
    const result = await checkBlockAllowed(
      db({ sites: [site("acc_1", "acme.com")], accounts: [account("acc_1", "a@acme.com")], subscriptions: [sub("acc_1", "cancelled")] }),
      "acme.com"
    );
    expect(result).toEqual({
      ok: false,
      status: 503,
      error: "Not blocked. We couldn't confirm with Stripe, so nothing was changed. Try again.",
    });
  });

  it.each(["sites", "accounts", "subscriptions", "licensing_domains"])("fails closed when the %s lookup throws (503)", async (table) => {
    const result = await checkBlockAllowed(
      db({ sites: [site("acc_1", "acme.com")], accounts: [account("acc_1", "a@acme.com")], subscriptions: [sub("acc_1", "active")] }, [table]),
      "acme.com"
    );
    expect(result).toEqual({
      ok: false,
      status: 503,
      error: "Not blocked. We couldn't check who owns acme.com, so nothing was changed. Try again.",
    });
  });

  describe("excludeAccountId", () => {
    it("is honoured for a cancelled account", async () => {
      vi.mocked(stripeShowsPaying).mockResolvedValue({ paying: true, status: "active", customerId: "cus_acc_1" });
      const tables = {
        sites: [site("acc_1", "acme.com")],
        accounts: [account("acc_1", "a@acme.com", "2026-09-26T00:00:00Z")],
        subscriptions: [sub("acc_1", "cancelled")],
      };
      expect(await checkBlockAllowed(db(tables), "acme.com", {})).toMatchObject({ ok: false, status: 409 });
      vi.mocked(stripeShowsPaying).mockClear();
      expect(await checkBlockAllowed(db(tables), "acme.com", { excludeAccountId: "acc_1" })).toEqual({ ok: true, domain: "acme.com" });
      expect(stripeShowsPaying).not.toHaveBeenCalled();
    });

    it("is honoured for a subscription set to cancel at period end", async () => {
      vi.mocked(getSubscriptionEndState).mockResolvedValue("ending");
      const result = await checkBlockAllowed(
        db({ sites: [site("acc_1", "acme.com")], accounts: [account("acc_1", "a@acme.com")], subscriptions: [sub("acc_1", "active")] }),
        "acme.com",
        { excludeAccountId: "acc_1" }
      );
      expect(getSubscriptionEndState).toHaveBeenCalledWith("sub_acc_1");
      expect(result).toEqual({ ok: true, domain: "acme.com" });
    });

    it("is ignored for an ordinary paying account", async () => {
      vi.mocked(getSubscriptionEndState).mockResolvedValue("live");
      const result = await checkBlockAllowed(
        db({ sites: [site("acc_1", "acme.com")], accounts: [account("acc_1", "a@acme.com")], subscriptions: [sub("acc_1", "active")] }),
        "acme.com",
        { excludeAccountId: "acc_1" }
      );
      expect(result).toMatchObject({ ok: false, status: 409 });
    });

    it("is ignored when Stripe can't say", async () => {
      vi.mocked(getSubscriptionEndState).mockRejectedValue(new Error("stripe down"));
      const result = await checkBlockAllowed(
        db({ sites: [site("acc_1", "acme.com")], accounts: [account("acc_1", "a@acme.com")], subscriptions: [sub("acc_1", "active")] }),
        "acme.com",
        { excludeAccountId: "acc_1" }
      );
      expect(result).toMatchObject({ ok: false, status: 409 });
    });

    it("never drops another paying customer on the same root", async () => {
      const result = await checkBlockAllowed(
        db({
          sites: [site("acc_cancel", "acme.com"), site("acc_other", "lp.acme.com")],
          accounts: [account("acc_cancel", "c@acme.com", "2026-09-26T00:00:00Z"), account("acc_other", "o@acme.com")],
          subscriptions: [sub("acc_cancel", "cancelled"), sub("acc_other", "active")],
        }),
        "acme.com",
        { excludeAccountId: "acc_cancel" }
      );
      expect(result).toEqual({
        ok: false,
        status: 409,
        error: "Not blocked. lp.acme.com belongs to a paying customer (o@acme.com, Starter).",
      });
    });
  });

  it("allows a stranger's domain", async () => {
    const result = await checkBlockAllowed(
      db({ sites: [site("acc_1", "notstranger.com")], accounts: [account("acc_1", "a@x.com")], subscriptions: [sub("acc_1", "active")] }),
      "Stranger.com"
    );
    expect(result).toEqual({ ok: true, domain: "stranger.com" });
    expect(stripeShowsPaying).not.toHaveBeenCalled();
  });
});
