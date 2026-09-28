import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { getAccountSites } from "@/lib/queries/account-detail";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createFakeLicensingDb } from "../../__mocks__/licensing-db";

const site = (id: string, account_id = "acc_1") => ({
  id,
  account_id,
  name: id,
  domain: `${id}.com`,
  website_url: `https://${id}.com`,
  status: "active",
  is_default: false,
  created_at: `2026-01-0${id.slice(-1)}T00:00:00Z`,
});

const sites = [site("site_1"), site("site_2"), site("site_3"), site("site_4", "acc_other")];
// Each row carries its embedded site, as select("site_id, sites!inner(account_id)") returns it
const integration = (site_id: string, client_type: string, disconnected_at: string | null, account_id = "acc_1") => ({
  site_id,
  client_type,
  disconnected_at,
  sites: { account_id },
});
const site_integrations = [
  integration("site_1", "webflow_app", null),
  integration("site_2", "webflow_app", "2026-05-01T00:00:00Z"),
  integration("site_3", "wordpress_plugin", null),
  integration("site_4", "webflow_app", null, "acc_other"),
];

describe("getAccountSites webflowConnected", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("flags only sites with a live Webflow Marketplace connection", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue(createFakeLicensingDb({ sites, site_integrations }) as never);

    const result = await getAccountSites("acc_1");

    expect(result.map((s) => [s.id, s.webflowConnected])).toEqual([
      ["site_1", true],
      ["site_2", false],
      ["site_3", false],
    ]);
  });

  it("filters through the sites join, not a list of every site id", async () => {
    const fake = createFakeLicensingDb({ sites, site_integrations });
    const inSpy = vi.fn();
    const from = fake.from;
    fake.from = (table: string) => {
      const builder = from(table) as { in: (...args: unknown[]) => unknown };
      if (table === "site_integrations") {
        const original = builder.in;
        builder.in = (...args: unknown[]) => {
          inSpy(...args);
          return original(...args);
        };
      }
      return builder;
    };
    vi.mocked(createSupabaseAdminClient).mockReturnValue(fake as never);

    await getAccountSites("acc_1");

    // !inner makes the embedded filter drop other accounts' rows instead of just nulling the embed
    expect(fake.queries.find((q) => q.table === "site_integrations")?.select).toBe("site_id, sites!inner(account_id)");
    expect(inSpy).not.toHaveBeenCalled();
  });

  it("treats every site as connected when the check fails, so Edit is hidden", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      createFakeLicensingDb({ sites, site_integrations }, { failTables: ["site_integrations"] }) as never
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await getAccountSites("acc_1");

    expect(result.map((s) => s.webflowConnected)).toEqual([true, true, true]);
    consoleError.mockRestore();
  });
});
