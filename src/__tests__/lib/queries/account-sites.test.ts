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
const site_integrations = [
  { site_id: "site_1", client_type: "webflow_app", disconnected_at: null },
  { site_id: "site_2", client_type: "webflow_app", disconnected_at: "2026-05-01T00:00:00Z" },
  { site_id: "site_3", client_type: "wordpress_plugin", disconnected_at: null },
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
