import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/external/blocklist", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/external/blocklist")>()),
  checkBlockedDomainsStrict: vi.fn(),
  unblockDomain: vi.fn(),
  blockDomain: vi.fn(),
}));
vi.mock("@/lib/licensing/record-unblocked", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/licensing/record-unblocked")>();
  return { recordUnblocked: vi.fn(actual.recordUnblocked) };
});

import type { SupabaseClient } from "@supabase/supabase-js";
import { editSiteAddress, type EditSiteInput } from "@/lib/sites/edit-site-address";
import { blockDomain, checkBlockedDomainsStrict, unblockDomain } from "@/lib/external/blocklist";
import { recordUnblocked } from "@/lib/licensing/record-unblocked";
import { createFakeLicensingDb, type FakeLicensingDb } from "../../__mocks__/licensing-db";

type Row = Record<string, unknown>;

const ME = "acc_me";
const account = (id: string, email: string, cancelled_at: string | null = null) => ({ id, name: `${id} name`, email, cancelled_at });
const sub = (account_id: string, status: string) => ({
  account_id,
  status,
  created_at: "2026-01-01T00:00:00Z",
  plan_name: "Starter",
  stripe_customer_id: `cus_${account_id}`,
  stripe_subscription_id: `sub_${account_id}`,
});
let seq = 0;
const site = (account_id: string, domain: string | null, status = "active", extra: Row = {}) => ({
  id: `site_${++seq}`,
  account_id,
  domain,
  website_url: domain ? `https://${domain}` : null,
  status,
  ...extra,
});

// The site being edited: a typo on a paying account
const editedSite = (extra: Row = {}) =>
  site(ME, "acmeroofng.com", "active", { id: "site_edit", website_url: "https://www.acmeroofng.com", ...extra });

interface Tables {
  sites?: Row[];
  accounts?: Row[];
  subscriptions?: Row[];
  site_integrations?: Row[];
  licensing_domains?: Row[];
}

let fake: FakeLicensingDb;

function db(tables: Tables = {}, opts: { failTables?: string[]; failWrites?: string[]; site?: Row } = {}) {
  fake = createFakeLicensingDb(
    {
      sites: [opts.site ?? editedSite(), ...(tables.sites ?? [])],
      accounts: [account(ME, "me@acmeroofing.test"), ...(tables.accounts ?? [])],
      subscriptions: [sub(ME, "active"), ...(tables.subscriptions ?? [])],
      site_integrations: tables.site_integrations ?? [],
      licensing_domains: tables.licensing_domains ?? [],
      licensing_reviews: [],
      event_log: [],
    },
    { failTables: opts.failTables, failWrites: opts.failWrites }
  );
  return fake as unknown as SupabaseClient;
}

function input(overrides: Partial<EditSiteInput> = {}): EditSiteInput {
  return {
    accountId: ME,
    siteId: "site_edit",
    websiteUrl: "https://www.acmeroofing.com",
    expectedDomain: "acmeroofng.com",
    confirmedDomain: null,
    actor: "admin@example.com",
    ...overrides,
  };
}

const editedRow = () => fake.rows("sites").find((r) => r.id === "site_edit");
const events = () => fake.rows("event_log");
const siteWrites = () => fake.writes.filter((w) => w.table === "sites");

function blockedIs(isBlocked: boolean | null) {
  vi.mocked(checkBlockedDomainsStrict).mockImplementation(async (domains: string[]) =>
    domains.map((domain) => ({ domain, isBlocked }))
  );
}

describe("editSiteAddress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    blockedIs(false);
    vi.mocked(unblockDomain).mockResolvedValue({ success: true });
  });

  // The admin edit never blocks anything, in any path.
  afterEach(() => {
    expect(blockDomain).not.toHaveBeenCalled();
    vi.mocked(console.error).mockRestore();
  });

  describe("saving", () => {
    it("saves the website URL and the normalised domain together", async () => {
      const result = await editSiteAddress(db(), input());

      expect(result).toEqual({
        kind: "saved",
        site: { id: "site_edit", domain: "acmeroofing.com", websiteUrl: "https://www.acmeroofing.com" },
        unblock: "not_blocked",
        eventLogged: true,
        unblockRecorded: true,
      });
      expect(editedRow()).toMatchObject({ domain: "acmeroofing.com", website_url: "https://www.acmeroofing.com" });
      expect(editedRow()?.updated_at).toEqual(expect.any(String));
    });

    it("adds https:// when the address has no scheme", async () => {
      const result = await editSiteAddress(db(), input({ websiteUrl: "acmeroofing.com" }));
      expect(result).toMatchObject({ kind: "saved", site: { domain: "acmeroofing.com", websiteUrl: "https://acmeroofing.com" } });
    });

    it("logs site_updated with the old and new values straight after the update", async () => {
      await editSiteAddress(db(), input());

      expect(events()).toEqual([
        {
          account_id: ME,
          event_type: "site_updated",
          event_subtype: null,
          source: "admin_action",
          metadata: {
            siteId: "site_edit",
            oldDomain: "acmeroofng.com",
            newDomain: "acmeroofing.com",
            oldWebsiteUrl: "https://www.acmeroofng.com",
            newWebsiteUrl: "https://www.acmeroofing.com",
            actor: "admin@example.com",
            reason: "address_correction",
            confirmedDomain: null,
            conflicts: [],
          },
        },
      ]);
      const order = fake.writes.map((w) => `${w.op} ${w.table}`);
      expect(order.slice(0, 2)).toEqual(["update sites", "insert event_log"]);
    });

    it("keeps the save and reports eventLogged false when the event insert fails", async () => {
      const result = await editSiteAddress(db({}, { failWrites: ["event_log"] }), input());

      expect(result).toMatchObject({ kind: "saved", eventLogged: false });
      expect(editedRow()).toMatchObject({ domain: "acmeroofing.com" });
    });

    it("returns 500 and changes nothing when the update fails", async () => {
      const result = await editSiteAddress(db({}, { failWrites: ["sites"] }), input());

      expect(result).toEqual({ kind: "error", status: 500, message: "Not saved. The database didn't accept the change. Try again." });
      expect(editedRow()).toMatchObject({ domain: "acmeroofng.com" });
      expect(events()).toHaveLength(0);
      expect(unblockDomain).not.toHaveBeenCalled();
    });

    it("sets an address on a site with no domain when the window opened with none", async () => {
      const result = await editSiteAddress(
        db({}, { site: editedSite({ domain: null, website_url: null }) }),
        input({ expectedDomain: null })
      );
      expect(result).toMatchObject({ kind: "saved", site: { domain: "acmeroofing.com" } });
      expect(editedRow()).toMatchObject({ domain: "acmeroofing.com" });
    });
  });

  describe("refusals", () => {
    it.each([
      ["", "Not saved. Enter a website address."],
      ["not a website", "Not saved. That isn't a valid website address."],
      ["https://192.168.0.1", "Not saved. That isn't a valid website address."],
      ["co.uk", "Not saved. That isn't a valid website address."],
    ])("refuses %j (400) and writes nothing", async (websiteUrl, message) => {
      expect(await editSiteAddress(db(), input({ websiteUrl }))).toEqual({ kind: "refused", status: 400, message });
      expect(fake.writes).toHaveLength(0);
    });

    it("refuses a site on another account (404)", async () => {
      const result = await editSiteAddress(db(), input({ accountId: "acc_someone_else" }));
      expect(result).toEqual({ kind: "refused", status: 404, message: "Site not found." });
      expect(fake.writes).toHaveLength(0);
    });

    it("refuses when the address changed since the window opened (409) and writes nothing", async () => {
      const result = await editSiteAddress(db(), input({ expectedDomain: "something-else.com" }));

      expect(result).toEqual({
        kind: "refused",
        status: 409,
        message: "Not saved. This site's address changed since you opened it. Refresh and try again.",
      });
      expect(fake.writes).toHaveLength(0);
      expect(editedRow()).toMatchObject({ domain: "acmeroofng.com" });
    });

    it("refuses a stale null expectedDomain on a site that now has a domain", async () => {
      const result = await editSiteAddress(db(), input({ expectedDomain: null }));
      expect(result).toMatchObject({ kind: "refused", status: 409 });
      expect(fake.writes).toHaveLength(0);
    });

    it("guards the update itself: a domain changed after the read returns the stale refusal", async () => {
      db();
      // Another tab saves between our read and our update
      const racing = {
        from: (table: string) => {
          const builder = fake.from(table) as { update: (values: Row) => unknown };
          if (table === "sites") {
            const update = builder.update;
            builder.update = (values: Row) => {
              editedRow()!.domain = "someone-else.com";
              return update(values);
            };
          }
          return builder;
        },
      };

      const result = await editSiteAddress(racing as unknown as SupabaseClient, input());

      expect(result).toEqual({
        kind: "refused",
        status: 409,
        message: "Not saved. This site's address changed since you opened it. Refresh and try again.",
      });
      expect(editedRow()).toMatchObject({ domain: "someone-else.com", website_url: "https://www.acmeroofng.com" });
      expect(events()).toHaveLength(0);
    });

    it("refuses a site connected through the Webflow Marketplace (409)", async () => {
      const result = await editSiteAddress(
        db({ site_integrations: [{ id: "si_1", site_id: "site_edit", client_type: "webflow_app", disconnected_at: null }] }),
        input()
      );

      expect(result).toEqual({
        kind: "refused",
        status: 409,
        message: "Not saved. This site is connected through the Webflow Marketplace, so its address can't be changed here.",
      });
      expect(fake.writes).toHaveLength(0);
    });

    it("doesn't refuse a disconnected Webflow install or a WordPress plugin connection", async () => {
      const result = await editSiteAddress(
        db({
          site_integrations: [
            { id: "si_1", site_id: "site_edit", client_type: "webflow_app", disconnected_at: "2026-05-01T00:00:00Z" },
            { id: "si_2", site_id: "site_edit", client_type: "wordpress_plugin", disconnected_at: null },
            { id: "si_3", site_id: "site_other", client_type: "webflow_app", disconnected_at: null },
          ],
        }),
        input()
      );
      expect(result).toMatchObject({ kind: "saved" });
    });

    it("refuses the address the site already has (400)", async () => {
      const result = await editSiteAddress(db(), input({ websiteUrl: "https://acmeroofng.com/contact" }));
      expect(result).toEqual({ kind: "refused", status: 400, message: "Not saved. That's already this site's address." });
      expect(fake.writes).toHaveLength(0);
    });

    it("refuses a shared host (409)", async () => {
      const result = await editSiteAddress(db(), input({ websiteUrl: "https://acme.webflow.io" }));
      expect(result).toEqual({
        kind: "refused",
        status: 409,
        message: "Not saved. acme.webflow.io is a shared hosting address. Use the site's own domain.",
      });
      expect(fake.writes).toHaveLength(0);
    });

    it.each(["active", "suspended"])("refuses the exact domain of a paying account's %s site (409)", async (status) => {
      const result = await editSiteAddress(
        db({
          accounts: [account("acc_pay", "ops@acmeroofing.com")],
          subscriptions: [sub("acc_pay", "active")],
          sites: [site("acc_pay", "acmeroofing.com", status)],
        }),
        input()
      );

      expect(result).toEqual({
        kind: "refused",
        status: 409,
        message: "Not saved. acmeroofing.com is already a site on a paying account (ops@acmeroofing.com).",
      });
      expect(fake.writes).toHaveLength(0);
    });

    it("refuses when this account already has another live site on the exact domain (409)", async () => {
      const result = await editSiteAddress(db({ sites: [site(ME, "acmeroofing.com", "active")] }), input());

      expect(result).toEqual({
        kind: "refused",
        status: 409,
        message: "Not saved. This account already has a site on acmeroofing.com.",
      });
      expect(fake.writes).toHaveLength(0);
    });
  });

  describe("shared root warning", () => {
    const sibling = () =>
      db({
        accounts: [account("acc_shop", "shop@acmeroofing.com")],
        subscriptions: [sub("acc_shop", "active")],
        sites: [site("acc_shop", "shop.acmeroofing.com", "active")],
      });

    it("asks for confirmation when another account has a sibling subdomain", async () => {
      const result = await editSiteAddress(sibling(), input());

      expect(result).toEqual({
        kind: "needs_confirmation",
        message:
          "acmeroofing.com is also used by shop@acmeroofing.com (active). A block on one account can switch off the other, so check this is the right customer.",
        conflicts: [
          {
            domain: "shop.acmeroofing.com",
            accountEmail: "shop@acmeroofing.com",
            status: "active",
            paying: true,
            latestStatus: "active",
            sameAccount: false,
          },
        ],
      });
      expect(fake.writes).toHaveLength(0);
    });

    it("saves once the admin confirms this exact domain, and records the confirmation", async () => {
      const result = await editSiteAddress(sibling(), input({ confirmedDomain: "acmeroofing.com" }));

      expect(result).toMatchObject({ kind: "saved", site: { domain: "acmeroofing.com" } });
      expect(events()[0]).toMatchObject({
        metadata: {
          confirmedDomain: "acmeroofing.com",
          conflicts: [expect.objectContaining({ domain: "shop.acmeroofing.com", accountEmail: "shop@acmeroofing.com" })],
        },
      });
    });

    it("doesn't let a confirmation for one domain through for another", async () => {
      const client = db({
        accounts: [account("acc_shop", "shop@acmeroofing.com"), account("acc_b", "b@bestroofing.com")],
        subscriptions: [sub("acc_shop", "active"), sub("acc_b", "canceled")],
        sites: [site("acc_shop", "shop.acmeroofing.com", "active"), site("acc_b", "blog.bestroofing.com", "active")],
      });

      const result = await editSiteAddress(
        client,
        input({ websiteUrl: "https://bestroofing.com", confirmedDomain: "acmeroofing.com" })
      );

      expect(result).toMatchObject({ kind: "needs_confirmation", conflicts: [expect.objectContaining({ accountEmail: "b@bestroofing.com" })] });
      expect(fake.writes).toHaveLength(0);
    });

    it("warns, not refuses, for the exact domain on a cancelled account's still-active site", async () => {
      const result = await editSiteAddress(
        db({
          accounts: [account("acc_gone", "gone@acmeroofing.com", "2026-06-01T00:00:00Z")],
          subscriptions: [sub("acc_gone", "active")],
          sites: [site("acc_gone", "acmeroofing.com", "active")],
        }),
        input()
      );

      expect(result).toMatchObject({
        kind: "needs_confirmation",
        message: expect.stringMatching(/^acmeroofing\.com is also used by gone@acmeroofing\.com \(active\)\./),
        conflicts: [expect.objectContaining({ domain: "acmeroofing.com", paying: false, latestStatus: "active" })],
      });
    });

    it("warns, not refuses, for the exact domain on a never-subscribed signup's inactive site", async () => {
      const result = await editSiteAddress(
        db({ accounts: [account("acc_signup", "new@acmeroofing.com")], sites: [site("acc_signup", "acmeroofing.com", "inactive")] }),
        input()
      );

      expect(result).toMatchObject({
        kind: "needs_confirmation",
        conflicts: [{ domain: "acmeroofing.com", accountEmail: "new@acmeroofing.com", status: "inactive", paying: false, latestStatus: null, sameAccount: false }],
      });

      const confirmed = await editSiteAddress(
        db({ accounts: [account("acc_signup", "new@acmeroofing.com")], sites: [site("acc_signup", "acmeroofing.com", "inactive")] }),
        input({ confirmedDomain: "acmeroofing.com" })
      );
      expect(confirmed).toMatchObject({ kind: "saved" });
    });

    it("warns when this account has another live site under the same root", async () => {
      const result = await editSiteAddress(db({ sites: [site(ME, "blog.acmeroofing.com", "suspended")] }), input());

      expect(result).toMatchObject({
        kind: "needs_confirmation",
        conflicts: [
          { domain: "blog.acmeroofing.com", accountEmail: "me@acmeroofing.test", status: "suspended", paying: true, sameAccount: true },
        ],
      });
    });

    it("doesn't warn about this account's inactive sites under the root, or the site being edited", async () => {
      const result = await editSiteAddress(
        db({ sites: [site(ME, "old.acmeroofing.com", "inactive")] }, { site: editedSite({ domain: "www-acmeroofing.acmeroofing.com" }) }),
        input({ expectedDomain: "www-acmeroofing.acmeroofing.com" })
      );
      expect(result).toMatchObject({ kind: "saved" });
    });

    it("lists other accounts before this account's sites", async () => {
      const result = await editSiteAddress(
        db({
          accounts: [account("acc_shop", "shop@acmeroofing.com")],
          sites: [site(ME, "blog.acmeroofing.com", "active"), site("acc_shop", "shop.acmeroofing.com", "inactive")],
        }),
        input()
      );

      expect(result).toMatchObject({
        kind: "needs_confirmation",
        message: expect.stringMatching(/^acmeroofing\.com is also used by shop@acmeroofing\.com \(inactive\)\./),
        conflicts: [expect.objectContaining({ sameAccount: false }), expect.objectContaining({ sameAccount: true })],
      });
    });

    it("says when the root is blocked and saving would unblock it", async () => {
      blockedIs(true);
      const result = await editSiteAddress(sibling(), input());

      expect(result).toMatchObject({
        kind: "needs_confirmation",
        message:
          "acmeroofing.com is also used by shop@acmeroofing.com (active). A block on one account can switch off the other, so check this is the right customer.\n" +
          "acmeroofing.com is blocked. Saving unblocks it for everyone on it, including shop@acmeroofing.com.",
      });
      expect(checkBlockedDomainsStrict).toHaveBeenCalledWith(["acmeroofing.com"]);
      expect(unblockDomain).not.toHaveBeenCalled();
    });

    it("says when it couldn't check the block", async () => {
      blockedIs(null);
      const result = await editSiteAddress(sibling(), input());

      expect(result).toMatchObject({
        kind: "needs_confirmation",
        message: expect.stringContaining(
          "\nWe couldn't check whether acmeroofing.com is blocked. If it is, saving unblocks it for everyone on it, including shop@acmeroofing.com."
        ),
      });
    });

    it("says it couldn't check when the block check throws", async () => {
      vi.mocked(checkBlockedDomainsStrict).mockRejectedValue(new Error("network down"));
      const result = await editSiteAddress(sibling(), input());

      expect(result).toMatchObject({
        kind: "needs_confirmation",
        message: expect.stringContaining("\nWe couldn't check whether acmeroofing.com is blocked."),
      });
    });

    it("doesn't check the block when this save wouldn't unblock", async () => {
      const client = db(
        {
          accounts: [account("acc_shop", "shop@acmeroofing.com")],
          sites: [site("acc_shop", "shop.acmeroofing.com", "active")],
        },
        { site: editedSite({ status: "suspended" }) }
      );
      blockedIs(true);

      const result = await editSiteAddress(client, input());

      expect(result).toMatchObject({ kind: "needs_confirmation", message: expect.not.stringContaining("blocked.") });
      expect(checkBlockedDomainsStrict).not.toHaveBeenCalled();
    });
  });

  describe("unblocking", () => {
    it("doesn't unblock when the domain isn't blocked", async () => {
      const result = await editSiteAddress(db(), input());

      expect(result).toMatchObject({ kind: "saved", unblock: "not_blocked" });
      expect(checkBlockedDomainsStrict).toHaveBeenCalledWith(["acmeroofing.com"]);
      expect(unblockDomain).not.toHaveBeenCalled();
      expect(recordUnblocked).not.toHaveBeenCalled();
    });

    it("skips the check for a suspended site", async () => {
      const result = await editSiteAddress(db({}, { site: editedSite({ status: "suspended" }) }), input());

      expect(result).toMatchObject({ kind: "saved", unblock: "skipped" });
      expect(checkBlockedDomainsStrict).not.toHaveBeenCalled();
      expect(unblockDomain).not.toHaveBeenCalled();
    });

    it("skips the check when the account isn't paying", async () => {
      const client = db();
      fake.rows("subscriptions")[0].status = "canceled";

      const result = await editSiteAddress(client, input());

      expect(result).toMatchObject({ kind: "saved", unblock: "skipped" });
      expect(checkBlockedDomainsStrict).not.toHaveBeenCalled();
    });

    it("unblocks the new domain once and records it against the root", async () => {
      blockedIs(true);
      const client = db({
        licensing_domains: [
          { domain: "acmeroofing.com", status: "blocked", is_blocked: true },
          { domain: "other.com", status: "blocked", is_blocked: true },
        ],
      });

      const result = await editSiteAddress(client, input());

      expect(result).toMatchObject({ kind: "saved", unblock: "unblocked", unblockRecorded: true });
      expect(unblockDomain).toHaveBeenCalledTimes(1);
      expect(unblockDomain).toHaveBeenCalledWith("acmeroofing.com");
      expect(recordUnblocked).toHaveBeenCalledWith(
        expect.anything(),
        "acmeroofing.com",
        "Unblocked after correcting acmeroofng.com to acmeroofing.com",
        "admin@example.com",
        { rowDomains: ["acmeroofing.com"] }
      );
      expect(fake.rows("licensing_domains")).toEqual([
        expect.objectContaining({ domain: "acmeroofing.com", status: "pending_check", is_blocked: false, reviewed_by: "admin@example.com" }),
        expect.objectContaining({ domain: "other.com", status: "blocked", is_blocked: true }),
      ]);
      expect(events().map((e) => e.event_type)).toEqual(["site_updated", "domain_unblocked"]);
      expect(events()[1]).toEqual({
        account_id: ME,
        event_type: "domain_unblocked",
        event_subtype: null,
        source: "admin_action",
        metadata: {
          domain: "acmeroofing.com",
          root: "acmeroofing.com",
          reason: "address_correction",
          siteId: "site_edit",
          actor: "admin@example.com",
        },
      });
    });

    it("unblocks a subdomain whose parent root is blocked, once, and resets the root family's rows", async () => {
      blockedIs(true);
      const client = db({
        licensing_domains: [
          { domain: "acmeroofing.com", status: "blocked", is_blocked: true },
          { domain: "shop.acmeroofing.com", status: "confirmed_unlicensed", is_blocked: true },
          { domain: "blog.acmeroofing.com", status: "blocked", is_blocked: true },
        ],
      });

      const result = await editSiteAddress(client, input({ websiteUrl: "https://shop.acmeroofing.com" }));

      expect(result).toMatchObject({ kind: "saved", unblock: "unblocked" });
      expect(checkBlockedDomainsStrict).toHaveBeenCalledTimes(1);
      expect(checkBlockedDomainsStrict).toHaveBeenCalledWith(["shop.acmeroofing.com"]);
      expect(unblockDomain).toHaveBeenCalledTimes(1);
      expect(unblockDomain).toHaveBeenCalledWith("shop.acmeroofing.com");
      expect(recordUnblocked).toHaveBeenCalledWith(expect.anything(), "acmeroofing.com", expect.any(String), "admin@example.com", {
        rowDomains: ["shop.acmeroofing.com", "acmeroofing.com"],
      });
      const byDomain = Object.fromEntries(fake.rows("licensing_domains").map((r) => [r.domain, r.status]));
      expect(byDomain).toEqual({
        "acmeroofing.com": "pending_check",
        "shop.acmeroofing.com": "pending_check",
        "blog.acmeroofing.com": "blocked",
      });
    });

    it("reports failed, and records nothing, when the licensing server rejects the unblock", async () => {
      blockedIs(true);
      vi.mocked(unblockDomain).mockResolvedValue({ success: false });

      const result = await editSiteAddress(db(), input());

      expect(result).toMatchObject({ kind: "saved", unblock: "failed", unblockRecorded: true });
      expect(recordUnblocked).not.toHaveBeenCalled();
      expect(events().map((e) => e.event_type)).toEqual(["site_updated"]);
    });

    it("reports disabled when licensing writes are switched off", async () => {
      blockedIs(true);
      vi.mocked(unblockDomain).mockResolvedValue({ success: false, reason: "disabled" });

      const result = await editSiteAddress(db(), input());

      expect(result).toMatchObject({ kind: "saved", unblock: "disabled" });
      expect(recordUnblocked).not.toHaveBeenCalled();
    });

    it("reports check_failed, and doesn't unblock, when the licensing server can't answer", async () => {
      blockedIs(null);

      const result = await editSiteAddress(db(), input());

      expect(result).toMatchObject({ kind: "saved", unblock: "check_failed" });
      expect(unblockDomain).not.toHaveBeenCalled();
      expect(recordUnblocked).not.toHaveBeenCalled();
    });

    it("reports check_failed when the block check throws, and keeps the save", async () => {
      vi.mocked(checkBlockedDomainsStrict).mockRejectedValue(new Error("network down"));

      const result = await editSiteAddress(db(), input());

      expect(result).toMatchObject({ kind: "saved", unblock: "check_failed" });
      expect(editedRow()).toMatchObject({ domain: "acmeroofing.com" });
      expect(unblockDomain).not.toHaveBeenCalled();
    });

    it("keeps the save and reports unblockRecorded false when the licensing record doesn't save", async () => {
      blockedIs(true);

      const result = await editSiteAddress(db({}, { failWrites: ["licensing_reviews"] }), input());

      expect(result).toMatchObject({ kind: "saved", unblock: "unblocked", eventLogged: true, unblockRecorded: false });
      expect(editedRow()).toMatchObject({ domain: "acmeroofing.com" });
    });
  });

  describe("read failures fail closed", () => {
    it.each(["sites", "site_integrations", "accounts", "subscriptions"])(
      "returns 503 and writes nothing when reading %s fails",
      async (table) => {
        const result = await editSiteAddress(db({}, { failTables: [table] }), input());

        expect(result).toEqual({
          kind: "error",
          status: 503,
          message: "Not saved. We couldn't check the records, so nothing was changed. Try again.",
        });
        expect(fake.writes).toHaveLength(0);
        expect(siteWrites()).toHaveLength(0);
        expect(unblockDomain).not.toHaveBeenCalled();
      }
    );
  });
});
