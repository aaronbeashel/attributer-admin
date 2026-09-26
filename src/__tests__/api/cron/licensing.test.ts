import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/external/blocklist", () => ({
  checkBlockedDomainsStrict: vi.fn(),
  checkBlockedDomains: vi.fn(),
  blockDomain: vi.fn(),
  unblockDomain: vi.fn(),
}));
vi.mock("@/lib/external/install-checker", () => ({ submitBatchCheck: vi.fn() }));
vi.mock("@/lib/licensing/entitlement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/licensing/entitlement")>()),
  loadSnapshot: vi.fn(),
}));

import { GET } from "@/app/api/cron/licensing/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { blockDomain, checkBlockedDomainsStrict, unblockDomain } from "@/lib/external/blocklist";
import { submitBatchCheck } from "@/lib/external/install-checker";
import { buildSnapshot, loadSnapshot } from "@/lib/licensing/entitlement";
import type { DomainRow } from "@/lib/licensing/decide";
import { createMockSupabaseClient } from "../../__mocks__/supabase";

const fetchMock = vi.fn();

const row = (overrides: Partial<DomainRow>): DomainRow => ({
  id: "row",
  domain: "x.com",
  status: "new",
  account_id: null,
  account_name: null,
  account_email: null,
  is_licensed: false,
  is_blocked: false,
  script_installed: null,
  check_error: null,
  ...overrides,
});

// A paying account with an active site on emoyer.com
const payingSnapshot = () =>
  buildSnapshot(
    [{ id: "site_1", account_id: "acc_pay", domain: "emoyer.com", status: "active" }],
    [{ id: "acc_pay", name: "Emoyer", email: "ops@emoyer.com", cancelled_at: null }],
    [
      {
        account_id: "acc_pay",
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
        plan_name: "Starter",
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_1",
      },
    ]
  );

function setup(rows: DomainRow[]) {
  const client = createMockSupabaseClient();
  // Writes come back with the updated row's id unless a test queues otherwise
  const domains = client._setResult("licensing_domains", { data: [{ id: "written" }], error: null });
  domains._resolve
    .mockResolvedValueOnce({ data: null, error: null }) // CSV upsert
    .mockResolvedValueOnce({ data: rows, error: null, count: rows.length }); // row read
  vi.mocked(createSupabaseAdminClient).mockReturnValue(client as never);
  return domains;
}

function request(query = "") {
  return new Request(`http://localhost/api/cron/licensing${query}`, { headers: { authorization: "Bearer cron-secret" } });
}

describe("GET /api/cron/licensing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret";
    process.env.ADMIN_APP_URL = "http://admin.test";
    process.env.CHECKER_WEBHOOK_SECRET = "checker-secret";
    fetchMock.mockImplementation(async () => new Response("domain,count\nemoyer.com,500\nstranger.com,300\n", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(loadSnapshot).mockResolvedValue(payingSnapshot());
    vi.mocked(submitBatchCheck).mockResolvedValue({ batch_id: "b1", total: 1 } as never);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns 401 without the cron secret", async () => {
    const res = await GET(new Request("http://localhost/api/cron/licensing"));
    expect(res.status).toBe(401);
  });

  it("licenses a formerly blocked, now unblocked paying domain and doesn't send it to the checker", async () => {
    const domains = setup([
      row({ id: "r_emoyer", domain: "emoyer.com", status: "blocked", is_blocked: true }),
      row({ id: "r_stranger", domain: "stranger.com", status: "new" }),
    ]);
    vi.mocked(checkBlockedDomainsStrict).mockResolvedValue([
      { domain: "emoyer.com", isBlocked: false },
      { domain: "stranger.com", isBlocked: false },
    ]);

    const res = await GET(request("?recheck=0"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(domains.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "licensed", is_licensed: true, is_blocked: false, account_id: "acc_pay" })
    );
    expect(domains.eq).toHaveBeenCalledWith("id", "r_emoyer");
    expect(domains.eq).toHaveBeenCalledWith("status", "blocked");
    expect(submitBatchCheck).toHaveBeenCalledWith(["stranger.com"], "http://admin.test/api/webhooks/checker", "checker-secret");
    expect(body.statusCounts).toEqual({ licensed: 1, pending_check: 1 });
    expect(body.payingButBlocked).toEqual([]);
    expect(blockDomain).not.toHaveBeenCalled();
    expect(unblockDomain).not.toHaveBeenCalled();
  });

  it("returns 500 and writes nothing when the snapshot fails to load", async () => {
    const domains = setup([row({ id: "r1", domain: "stranger.com" })]);
    vi.mocked(loadSnapshot).mockRejectedValue(new Error("Incomplete read of sites"));

    const res = await GET(request());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Incomplete read of sites/);
    expect(domains.update).not.toHaveBeenCalled();
    expect(checkBlockedDomainsStrict).not.toHaveBeenCalled();
    expect(submitBatchCheck).not.toHaveBeenCalled();
  });

  it("returns 500 and writes nothing when the licensing rows don't all load", async () => {
    const client = createMockSupabaseClient();
    const domains = client._setResult("licensing_domains", { data: null, error: null });
    domains._resolve
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: [row({ id: "r1" })], error: null, count: 2 });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(client as never);

    const res = await GET(request());
    expect(res.status).toBe(500);
    expect(domains.update).not.toHaveBeenCalled();
  });

  it("writes only changed rows, each guarded on the status it was read with", async () => {
    const domains = setup([
      row({ id: "r_same", domain: "stranger.com", status: "confirmed_unlicensed", script_installed: true }),
      row({ id: "r_lift", domain: "emoyer.com", status: "confirmed_unlicensed", script_installed: true }),
    ]);

    const res = await GET(request("?recheck=0"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(domains.update).toHaveBeenCalledTimes(1);
    expect(domains.update).toHaveBeenCalledWith({
      status: "licensed",
      is_licensed: true,
      account_id: "acc_pay",
      account_name: "Emoyer",
      account_email: "ops@emoyer.com",
      updated_at: expect.any(String),
    });
    expect(domains.eq).toHaveBeenCalledWith("id", "r_lift");
    expect(domains.eq).toHaveBeenCalledWith("status", "confirmed_unlicensed");
    expect(domains.eq).not.toHaveBeenCalledWith("id", "r_same");
    expect(body.changed).toBe(1);
    expect(checkBlockedDomainsStrict).not.toHaveBeenCalled();
  });

  it("counts a write the status guard skipped, and leaves that row out of the checker", async () => {
    const domains = setup([
      row({ id: "r_clicked", domain: "clicked.com", status: "new" }),
      row({ id: "r_other", domain: "other.com", status: "new" }),
    ]);
    // Aaron blocked clicked.com during the run, so its guarded write matches no row
    domains._resolve.mockResolvedValueOnce({ data: [], error: null });
    vi.mocked(checkBlockedDomainsStrict).mockResolvedValue([
      { domain: "clicked.com", isBlocked: false },
      { domain: "other.com", isBlocked: false },
    ]);

    const res = await GET(request("?recheck=0"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(domains.select).toHaveBeenCalledWith("id");
    expect(body).toMatchObject({ changed: 1, skippedByStatusGuard: 1, statusCounts: { new: 1, pending_check: 1 } });
    expect(submitBatchCheck).toHaveBeenCalledWith(["other.com"], expect.any(String), expect.any(String));
  });

  it("skips server-check writes and returns 503 when more than 5% of checks fail", async () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => row({ id: `r${i}`, domain: `d${i}.com`, status: "new" })),
      row({ id: "r_lift", domain: "emoyer.com", status: "confirmed_unlicensed" }),
    ];
    const domains = setup(rows);
    vi.mocked(checkBlockedDomainsStrict).mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({ domain: `d${i}.com`, isBlocked: i < 2 ? null : true }))
    );

    const res = await GET(request("?recheck=0"));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toMatchObject({ success: false, breakerTripped: true, serverCheckFailed: 2, changed: 1 });
    expect(domains.update).toHaveBeenCalledTimes(1);
    expect(domains.update).toHaveBeenCalledWith(expect.objectContaining({ status: "licensed" }));
    expect(submitBatchCheck).not.toHaveBeenCalled();
  });

  it("re-queues not_installed only when recheck says so", async () => {
    setup([row({ id: "r1", domain: "stranger.com", status: "not_installed", script_installed: false })]);
    vi.mocked(checkBlockedDomainsStrict).mockResolvedValue([{ domain: "stranger.com", isBlocked: false }]);

    await GET(request("?recheck=0"));
    expect(checkBlockedDomainsStrict).not.toHaveBeenCalled();
    expect(submitBatchCheck).not.toHaveBeenCalled();

    const domains = setup([row({ id: "r1", domain: "stranger.com", status: "not_installed", script_installed: false })]);
    await GET(request("?recheck=1"));
    expect(domains.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending_check", script_installed: null })
    );
    expect(domains.eq).toHaveBeenCalledWith("status", "not_installed");
    expect(submitBatchCheck).toHaveBeenCalledWith(["stranger.com"], expect.any(String), expect.any(String));
  });
});
