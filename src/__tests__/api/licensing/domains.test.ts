import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/licensing/snapshot-cache", () => ({ getHintSnapshot: vi.fn() }));

import { GET } from "@/app/api/licensing/domains/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getHintSnapshot } from "@/lib/licensing/snapshot-cache";
import { buildSnapshot } from "@/lib/licensing/entitlement";
import { createMockSupabaseClient } from "../../__mocks__/supabase";

const dbRow = (domain: string, status: string, account_id: string | null = null) => ({
  id: `row_${domain}`,
  domain,
  status,
  call_count: 500,
  account_id,
  account_name: null,
  account_email: null,
});

// qbench.net pays; qbench.com is its likely other domain
const snapshot = buildSnapshot(
  [{ id: "s1", account_id: "acc_q", domain: "qbench.net", status: "active" }],
  [{ id: "acc_q", name: "QBench", email: "nicholas@qbench.com", cancelled_at: null }],
  [{ account_id: "acc_q", status: "active", created_at: "2026-01-01T00:00:00Z", plan_name: "Starter", stripe_customer_id: "cus_q", stripe_subscription_id: "sub_q" }]
);

describe("GET /api/licensing/domains", () => {
  let client: ReturnType<typeof createMockSupabaseClient>;

  function withRows(rows: unknown[]) {
    const chain = client._setResult("licensing_domains", { data: [], error: null, count: 0 });
    chain._resolve.mockResolvedValueOnce({ data: rows, error: null });
    return chain;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockSupabaseClient();
    vi.mocked(createSupabaseAdminClient).mockReturnValue(client as never);
    vi.mocked(getHintSnapshot).mockResolvedValue(snapshot);
  });

  it("adds a review hint to listed rows", async () => {
    withRows([dbRow("qbench.com", "confirmed_unlicensed"), dbRow("stranger.com", "confirmed_unlicensed")]);

    const res = await GET(new Request("http://localhost/api/licensing/domains?status=confirmed_unlicensed"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.domains[0].hint).toEqual({
      kind: "other_domain",
      accountId: "acc_q",
      accountEmail: "nicholas@qbench.com",
      siteDomain: "qbench.net",
    });
    expect(body.domains[1].hint).toBeNull();
  });

  it("doesn't load the snapshot for other statuses", async () => {
    withRows([dbRow("qbench.com", "blocked")]);

    const body = await (await GET(new Request("http://localhost/api/licensing/domains?status=blocked"))).json();

    expect(getHintSnapshot).not.toHaveBeenCalled();
    expect(body.domains[0].hint).toBeNull();
  });

  it("returns 500 when the snapshot can't load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    withRows([dbRow("qbench.com", "check_failed")]);
    vi.mocked(getHintSnapshot).mockRejectedValue(new Error("db down"));

    const res = await GET(new Request("http://localhost/api/licensing/domains?status=check_failed"));

    expect(res.status).toBe(500);
  });

  it("counts shared_host rows", async () => {
    const chain = withRows([]);

    const body = await (await GET(new Request("http://localhost/api/licensing/domains?status=blocked"))).json();

    expect(chain.eq).toHaveBeenCalledWith("status", "shared_host");
    expect(body.counts).toHaveProperty("shared_host");
  });
});
