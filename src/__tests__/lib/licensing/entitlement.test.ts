import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildSnapshot,
  findOwners,
  findRootFamilyOwners,
  isPayingAccount,
  isPayingSite,
  latestSubscription,
  loadOwnersForDomain,
  loadSnapshot,
  payingOwner,
  reviewHint,
  type AccountRow,
  type SiteRow,
  type SubRow,
} from "@/lib/licensing/entitlement";
import { createMockSupabaseClient } from "../../__mocks__/supabase";
import { createFakeLicensingDb } from "../../__mocks__/licensing-db";

const account = (id: string, email: string | null, cancelled_at: string | null = null): AccountRow => ({
  id,
  name: `${id} name`,
  email,
  cancelled_at,
});

const sub = (account_id: string, status: string, created_at = "2026-01-01T00:00:00Z", extra: Partial<SubRow> = {}): SubRow => ({
  account_id,
  status,
  created_at,
  plan_name: "Starter",
  stripe_customer_id: `cus_${account_id}`,
  stripe_subscription_id: `sub_${account_id}`,
  ...extra,
});

let siteSeq = 0;
const site = (account_id: string, domain: string | null, status = "active"): SiteRow => ({
  id: `site_${++siteSeq}`,
  account_id,
  domain,
  status,
});

describe("paying rule", () => {
  it.each(["active", "trialing", "past_due"])("%s pays", (status) => {
    const a = account("acc_1", "a@x.com");
    expect(isPayingAccount(a, sub("acc_1", status))).toBe(true);
  });

  it.each(["deactivated", "cancelled"])("%s doesn't pay", (status) => {
    const a = account("acc_1", "a@x.com");
    expect(isPayingAccount(a, sub("acc_1", status))).toBe(false);
  });

  it("an old active row behind a newer cancelled row doesn't pay", () => {
    const subs = [sub("acc_1", "active", "2025-01-01T00:00:00Z"), sub("acc_1", "cancelled", "2026-01-01T00:00:00Z")];
    const latest = latestSubscription(subs);
    expect(latest?.status).toBe("cancelled");
    expect(isPayingAccount(account("acc_1", "a@x.com"), latest)).toBe(false);
  });

  it("a newer active row in front of an old cancelled row pays", () => {
    const subs = [sub("acc_1", "cancelled", "2025-01-01T00:00:00Z"), sub("acc_1", "active", "2026-01-01T00:00:00Z")];
    expect(isPayingAccount(account("acc_1", "a@x.com"), latestSubscription(subs))).toBe(true);
  });

  it("an account with cancelled_at set doesn't pay", () => {
    expect(isPayingAccount(account("acc_1", "a@x.com", "2026-02-01T00:00:00Z"), sub("acc_1", "active"))).toBe(false);
  });

  it("no subscription doesn't pay", () => {
    expect(isPayingAccount(account("acc_1", "a@x.com"), null)).toBe(false);
  });

  it("inactive and suspended sites don't license", () => {
    const a = account("acc_1", "a@x.com");
    const latest = sub("acc_1", "active");
    expect(isPayingSite(site("acc_1", "x.com", "active"), a, latest)).toBe(true);
    expect(isPayingSite(site("acc_1", "x.com", "inactive"), a, latest)).toBe(false);
    expect(isPayingSite(site("acc_1", "x.com", "suspended"), a, latest)).toBe(false);

    const snap = buildSnapshot(
      [site("acc_1", "inactive.com", "inactive"), site("acc_1", "suspended.com", "suspended")],
      [a],
      [latest]
    );
    expect(payingOwner(findOwners(snap, "inactive.com"))).toBeNull();
    expect(payingOwner(findOwners(snap, "suspended.com"))).toBeNull();
  });
});

describe("findOwners", () => {
  it("licenses greenvolt.com from a paying site on next.greenvolt.com", () => {
    const snap = buildSnapshot(
      [site("acc_gv", "next.greenvolt.com")],
      [account("acc_gv", "ops@greenvolt.com")],
      [sub("acc_gv", "active")]
    );
    expect(payingOwner(findOwners(snap, "greenvolt.com"))?.accountId).toBe("acc_gv");
    expect(payingOwner(findOwners(snap, "www.greenvolt.com"))?.accountId).toBe("acc_gv");
    expect(findOwners(snap, "notgreenvolt.com")).toEqual([]);
    expect(findOwners(snap, "greenvolt.com.au")).toEqual([]);
  });

  it("licenses a subdomain report from a paying root site", () => {
    const snap = buildSnapshot([site("acc_1", "greenvolt.com")], [account("acc_1", "a@x.com")], [sub("acc_1", "past_due")]);
    expect(payingOwner(findOwners(snap, "shop.greenvolt.com"))?.accountId).toBe("acc_1");
  });

  it("puts the paying account first when two accounts share a root", () => {
    const snap = buildSnapshot(
      [site("acc_old", "acme.com"), site("acc_pay", "www.acme.com")],
      [account("acc_old", "aaa@acme.com"), account("acc_pay", "zzz@acme.com")],
      [sub("acc_old", "cancelled"), sub("acc_pay", "active")]
    );
    const owners = findOwners(snap, "acme.com");
    expect(owners.map((o) => o.accountId)).toEqual(["acc_pay", "acc_old"]);
    expect(payingOwner(owners)?.accountId).toBe("acc_pay");
  });

  it("collects stripe customer ids from every subscription row", () => {
    const snap = buildSnapshot(
      [site("acc_1", "acme.com")],
      [account("acc_1", "a@acme.com")],
      [
        sub("acc_1", "cancelled", "2025-01-01T00:00:00Z", { stripe_customer_id: "cus_old" }),
        sub("acc_1", "cancelled", "2025-06-01T00:00:00Z", { stripe_customer_id: "cus_old" }),
        sub("acc_1", "deactivated", "2026-01-01T00:00:00Z", { stripe_customer_id: "cus_new" }),
      ]
    );
    expect(findOwners(snap, "acme.com")[0].stripeCustomerIds.sort()).toEqual(["cus_new", "cus_old"]);
  });

  it("sorts related sites into active, suspended and inactive buckets", () => {
    const snap = buildSnapshot(
      [
        site("acc_1", "a.acme.com", "active"),
        site("acc_1", "b.acme.com", "suspended"),
        site("acc_1", "c.acme.com", "inactive"),
        site("acc_1", "elsewhere.com", "active"),
        site("acc_1", null, "active"),
      ],
      [account("acc_1", "a@acme.com")],
      [sub("acc_1", "active")]
    );
    const [owner] = findOwners(snap, "acme.com");
    expect(owner.activeSites).toEqual([{ domain: "a.acme.com", status: "active" }]);
    expect(owner.suspendedSites).toEqual([{ domain: "b.acme.com", status: "suspended" }]);
    expect(owner.inactiveSites).toEqual([{ domain: "c.acme.com", status: "inactive" }]);
    // every active site on the account counts, including other domains and sites with no domain
    expect(owner.accountActiveSiteCount).toBe(3);
    expect(owner.planName).toBe("Starter");
    expect(owner.latestStatus).toBe("active");
  });
});

describe("findRootFamilyOwners", () => {
  it("finds the owner of a sibling subdomain", () => {
    const snap = buildSnapshot(
      [site("acc_drayana", "lp.clinicdrayana.com")],
      [account("acc_drayana", "dr@clinicdrayana.com")],
      [sub("acc_drayana", "active")]
    );
    expect(findOwners(snap, "sports.clinicdrayana.com")).toEqual([]);
    const owners = findRootFamilyOwners(snap, "sports.clinicdrayana.com");
    expect(owners.map((o) => o.accountId)).toEqual(["acc_drayana"]);
    expect(owners[0].activeSites).toEqual([{ domain: "lp.clinicdrayana.com", status: "active" }]);
  });

  it("does not reach across a multi-part public suffix", () => {
    const snap = buildSnapshot(
      [site("acc_other", "other.co.uk")],
      [account("acc_other", "o@other.co.uk")],
      [sub("acc_other", "active")]
    );
    expect(findRootFamilyOwners(snap, "shop.example.co.uk")).toEqual([]);
  });

  it("merges an account's sites across the family into one owner", () => {
    const snap = buildSnapshot(
      [site("acc_1", "lp.acme.com"), site("acc_1", "acme.com", "inactive")],
      [account("acc_1", "a@acme.com")],
      [sub("acc_1", "active")]
    );
    const owners = findRootFamilyOwners(snap, "shop.acme.com");
    expect(owners).toHaveLength(1);
    expect(owners[0].activeSites).toHaveLength(1);
    expect(owners[0].inactiveSites).toHaveLength(1);
  });
});

describe("reviewHint", () => {
  it("suspended_site: a paying account's related site is suspended", () => {
    const snap = buildSnapshot(
      [site("acc_1", "acme.com", "suspended"), site("acc_1", "other.com")],
      [account("acc_1", "a@acme.com")],
      [sub("acc_1", "active")]
    );
    expect(reviewHint(snap, "acme.com", null)).toEqual({
      kind: "suspended_site",
      accountId: "acc_1",
      accountEmail: "a@acme.com",
      siteDomain: "acme.com",
    });
  });

  it("no_active_sites: a paying account with a related site and no active site anywhere", () => {
    const snap = buildSnapshot(
      [site("acc_cn", "codeninjas.com", "inactive"), site("acc_cn", "cn2.com", "inactive")],
      [account("acc_cn", "ops@codeninjas.com")],
      [sub("acc_cn", "active")]
    );
    expect(reviewHint(snap, "codeninjas.com", null)).toEqual({
      kind: "no_active_sites",
      accountId: "acc_cn",
      accountEmail: "ops@codeninjas.com",
      siteDomain: "codeninjas.com",
    });
  });

  it("removed_site: a paying account removed this site and still has another", () => {
    const snap = buildSnapshot(
      [site("acc_1", "old.com", "inactive"), site("acc_1", "current.com")],
      [account("acc_1", "a@current.com")],
      [sub("acc_1", "active")]
    );
    expect(reviewHint(snap, "old.com", null)).toEqual({
      kind: "removed_site",
      accountId: "acc_1",
      accountEmail: "a@current.com",
      siteDomain: "old.com",
    });
  });

  it("other_domain: the row's linked account pays and has no related site", () => {
    const snap = buildSnapshot(
      [site("acc_1", "qbench.net")],
      [account("acc_1", "nicholas@example.org")],
      [sub("acc_1", "active")]
    );
    expect(reviewHint(snap, "somewhere.com", "acc_1")).toEqual({
      kind: "other_domain",
      accountId: "acc_1",
      accountEmail: "nicholas@example.org",
      siteDomain: "qbench.net",
    });
  });

  it("other_domain: a paying account's email domain matches", () => {
    const snap = buildSnapshot(
      [site("acc_1", "mezaitp.net")],
      [account("acc_1", "owner@mail.mezaitp.com")],
      [sub("acc_1", "trialing")]
    );
    expect(reviewHint(snap, "mezaitp.com", null)).toEqual({
      kind: "other_domain",
      accountId: "acc_1",
      accountEmail: "owner@mail.mezaitp.com",
      siteDomain: "mezaitp.net",
    });
  });

  it("other_domain: an active site's first label matches on a different root", () => {
    const snap = buildSnapshot(
      [site("acc_q", "app.qbench.net")],
      [account("acc_q", "nicholas@gmail.com")],
      [sub("acc_q", "active")]
    );
    expect(reviewHint(snap, "qbench.com", null)).toEqual({
      kind: "other_domain",
      accountId: "acc_q",
      accountEmail: "nicholas@gmail.com",
      siteDomain: "app.qbench.net",
    });
  });

  it("needs at least five characters for a first-label match", () => {
    const snap = buildSnapshot([site("acc_1", "acme.net")], [account("acc_1", "a@gmail.com")], [sub("acc_1", "active")]);
    expect(reviewHint(snap, "acme.com", null)).toBeNull();
  });

  it("follows the priority order suspended, no active, removed, other domain", () => {
    const snap = buildSnapshot(
      [
        site("acc_removed", "acme.com", "inactive"),
        site("acc_removed", "else.com"),
        site("acc_none", "acme.com", "inactive"),
        site("acc_susp", "shop.acme.com", "suspended"),
        site("acc_susp", "more.com"),
        site("acc_email", "acme-group.com"),
      ],
      [
        account("acc_removed", "r@else.com"),
        account("acc_none", "n@none.com"),
        account("acc_susp", "s@more.com"),
        account("acc_email", "e@acme.com"),
      ],
      [sub("acc_removed", "active"), sub("acc_none", "active"), sub("acc_susp", "active"), sub("acc_email", "active")]
    );
    expect(reviewHint(snap, "acme.com", "acc_email")?.kind).toBe("suspended_site");

    const noSuspended = buildSnapshot(
      [site("acc_removed", "acme.com", "inactive"), site("acc_removed", "else.com"), site("acc_none", "acme.com", "inactive")],
      [account("acc_removed", "r@else.com"), account("acc_none", "n@none.com")],
      [sub("acc_removed", "active"), sub("acc_none", "active")]
    );
    expect(reviewHint(noSuspended, "acme.com", null)?.kind).toBe("no_active_sites");
  });

  it("is null when the only candidate isn't paying", () => {
    const snap = buildSnapshot(
      [site("acc_1", "app.qbench.net"), site("acc_2", "acme.com", "inactive")],
      [account("acc_1", "x@qbench.com"), account("acc_2", "y@acme.com")],
      [sub("acc_1", "cancelled"), sub("acc_2", "deactivated")]
    );
    expect(reviewHint(snap, "qbench.com", "acc_1")).toBeNull();
    expect(reviewHint(snap, "acme.com", null)).toBeNull();
  });

  it("is null when a paying owner exists", () => {
    const snap = buildSnapshot([site("acc_1", "acme.com")], [account("acc_1", "a@acme.com")], [sub("acc_1", "active")]);
    expect(reviewHint(snap, "acme.com", "acc_1")).toBeNull();
  });
});

describe("loadSnapshot", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const siteRows = (n: number, offset = 0) =>
    Array.from({ length: n }, (_, i) => ({ id: `s${offset + i}`, account_id: "acc_1", domain: `d${offset + i}.com`, status: "active" }));

  function clientWith(sitesPages: Array<{ data: unknown; error: unknown; count?: number }>) {
    const client = createMockSupabaseClient();
    const sites = client._setResult("sites", { data: [], error: null, count: 0 });
    for (const page of sitesPages) sites._resolve.mockResolvedValueOnce(page);
    client._setResult("accounts", { data: [{ id: "acc_1", name: "A", email: "a@x.com", cancelled_at: null }], error: null, count: 1 });
    client._setResult("subscriptions", { data: [sub("acc_1", "active")], error: null, count: 1 });
    return { client, sites };
  }

  it("pages past 1,000 rows (1,000 then 3 gives 1,003)", async () => {
    const { client, sites } = clientWith([
      { data: siteRows(1000), error: null, count: 1003 },
      { data: siteRows(3, 1000), error: null },
    ]);
    const snap = await loadSnapshot(client as never);
    expect(snap.activeSiteCount.get("acc_1")).toBe(1003);
    expect(sites.order).toHaveBeenCalledWith("id");
    expect(sites.range).toHaveBeenCalledWith(0, 999);
    expect(sites.range).toHaveBeenCalledWith(1000, 1999);
    expect(sites.select).toHaveBeenCalledWith("id, account_id, domain, status", { count: "exact" });
  });

  it("throws when page 2 errors", async () => {
    const { client } = clientWith([
      { data: siteRows(1000), error: null, count: 1003 },
      { data: null, error: { message: "timeout" } },
    ]);
    await expect(loadSnapshot(client as never)).rejects.toThrow(/sites/);
  });

  it("retries the read once when a row lands mid-read", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client, sites } = clientWith([
      { data: siteRows(5), error: null, count: 6 },
      { data: siteRows(6), error: null, count: 6 },
    ]);
    const snap = await loadSnapshot(client as never);
    expect(snap.activeSiteCount.get("acc_1")).toBe(6);
    expect(sites.range).toHaveBeenCalledTimes(2);
  });

  it("throws when the read is still short after the retry", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = clientWith([
      { data: siteRows(5), error: null, count: 7 },
      { data: siteRows(5), error: null, count: 8 },
    ]);
    await expect(loadSnapshot(client as never)).rejects.toThrow(/Incomplete read of sites/);
  });

  it("doesn't retry a query error", async () => {
    const { client, sites } = clientWith([{ data: null, error: { message: "permission denied" } }]);
    await expect(loadSnapshot(client as never)).rejects.toThrow(/permission denied/);
    expect(sites.range).toHaveBeenCalledTimes(1);
  });
});

describe("loadOwnersForDomain", () => {
  const sites: SiteRow[] = [
    { id: "s1", account_id: "acc_gv", domain: "next.greenvolt.com", status: "active" },
    { id: "s2", account_id: "acc_gv", domain: "elsewhere.com", status: "active" },
    { id: "s3", account_id: "acc_old", domain: "GreenVolt.com", status: "inactive" },
    { id: "s4", account_id: "acc_decoy", domain: "notgreenvolt.com", status: "active" },
    { id: "s5", account_id: "acc_decoy", domain: "greenvolt.com.au", status: "active" },
    { id: "s6", account_id: "acc_sib", domain: "lp.clinicdrayana.com", status: "active" },
    { id: "s7", account_id: "acc_gv", domain: null, status: "active" },
  ];
  const accounts: AccountRow[] = [
    account("acc_gv", "ops@greenvolt.com"),
    account("acc_old", "old@greenvolt.com"),
    account("acc_decoy", "d@decoy.com"),
    account("acc_sib", "dr@clinicdrayana.com"),
    account("acc_linked", "linked@else.com"),
  ];
  const subs: SubRow[] = [
    sub("acc_gv", "active"),
    sub("acc_old", "cancelled"),
    sub("acc_decoy", "active"),
    sub("acc_sib", "active"),
    sub("acc_linked", "deactivated"),
  ];
  const db = () => createFakeLicensingDb({ sites, accounts, subscriptions: subs });

  it("returns the same owners as the snapshot path for the same rows", async () => {
    const snap = buildSnapshot(sites, accounts, subs);
    for (const domain of ["greenvolt.com", "shop.greenvolt.com", "sports.clinicdrayana.com", "nobody.com"]) {
      expect(await loadOwnersForDomain(db() as never, domain, "related")).toEqual(findOwners(snap, domain));
      expect(await loadOwnersForDomain(db() as never, domain, "rootFamily")).toEqual(findRootFamilyOwners(snap, domain));
    }
  });

  it("uses ilike for exact and subdomain matches", async () => {
    const fake = db();
    await loadOwnersForDomain(fake as never, "sports.clinicdrayana.com", "rootFamily");
    const orFilter = fake.queries.find((q) => q.or)?.or ?? "";
    expect(orFilter.split(",").sort()).toEqual(
      [
        "domain.ilike.sports.clinicdrayana.com",
        "domain.ilike.clinicdrayana.com",
        "domain.ilike.*.sports.clinicdrayana.com",
        "domain.ilike.*.clinicdrayana.com",
      ].sort()
    );
  });

  it("counts active sites on every domain of the owner's account", async () => {
    const [owner] = await loadOwnersForDomain(db() as never, "greenvolt.com", "related");
    expect(owner.accountId).toBe("acc_gv");
    expect(owner.accountActiveSiteCount).toBe(3);
  });

  it("returns extra accounts as owners even with no related site", async () => {
    const owners = await loadOwnersForDomain(db() as never, "greenvolt.com", "rootFamily", ["acc_linked"]);
    const linked = owners.find((o) => o.accountId === "acc_linked");
    expect(linked).toMatchObject({ accountPaying: false, activeSites: [], stripeCustomerIds: ["cus_acc_linked"] });
  });

  it("returns [] for a domain with characters outside the allowed set", async () => {
    expect(await loadOwnersForDomain(db() as never, "bad,domain.com", "related")).toEqual([]);
  });

  it("throws when 1,000 rows come back", async () => {
    const client = createMockSupabaseClient();
    client._setResult("sites", {
      data: Array.from({ length: 1000 }, (_, i) => ({ id: `s${i}`, account_id: "a", domain: `x${i}.acme.com`, status: "active" })),
      error: null,
    });
    await expect(loadOwnersForDomain(client as never, "acme.com", "related")).rejects.toThrow(/filter is wrong/);
  });

  it("throws on a query error", async () => {
    const failing = createFakeLicensingDb({ sites, accounts, subscriptions: subs }, { failTables: ["subscriptions"] });
    await expect(loadOwnersForDomain(failing as never, "greenvolt.com", "related")).rejects.toThrow(/subscriptions/);
  });
});
