import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));
vi.mock("@/lib/licensing/entitlement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/licensing/entitlement")>()),
  loadOwnersForDomain: vi.fn(),
}));

import { POST } from "@/app/api/webhooks/checker/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadOwnersForDomain, type Owner } from "@/lib/licensing/entitlement";

const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();

const owner = (overrides: Partial<Owner> = {}): Owner => ({
  accountId: "acc_pay",
  accountName: "Paying Co",
  accountEmail: "ops@paying.com",
  accountPaying: true,
  activeSites: [{ domain: "test.com", status: "active" }],
  suspendedSites: [],
  inactiveSites: [],
  planName: "Starter",
  latestStatus: "active",
  latestStripeSubscriptionId: "sub_1",
  stripeCustomerIds: ["cus_1"],
  accountActiveSiteCount: 1,
  ...overrides,
});

describe("POST /api/webhooks/checker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CHECKER_WEBHOOK_SECRET = "test-checker-secret";

    const chain = { update: mockUpdate, eq: mockEq, select: mockSelect };
    mockUpdate.mockReturnValue(chain);
    mockEq.mockReturnValue(chain);
    mockSelect.mockResolvedValue({ data: [{ id: "row_1" }], error: null });
    vi.mocked(loadOwnersForDomain).mockResolvedValue([]);

    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as never);
  });

  function makeRequest(body: Record<string, unknown>, secret = "test-checker-secret") {
    return new Request("http://localhost/api/webhooks/checker", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
    });
  }

  function expectGuardedUpdate(domain: string) {
    expect(mockEq).toHaveBeenCalledWith("domain", domain);
    expect(mockEq).toHaveBeenCalledWith("status", "pending_check");
    expect(mockSelect).toHaveBeenCalledWith("id");
  }

  it("returns 401 with wrong secret", async () => {
    const res = await POST(makeRequest({ domain: "test.com" }, "wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when domain is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("sets confirmed_unlicensed when removed is false and nobody pays", async () => {
    const res = await POST(makeRequest({
      domain: "https://test.com",
      removed: false,
      method: "network",
      checkedAt: "2026-04-08T12:00:00Z",
    }));

    expect(res.status).toBe(200);
    expect(loadOwnersForDomain).toHaveBeenCalledWith(expect.anything(), "test.com", "related");
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: "confirmed_unlicensed",
      script_installed: true,
      is_licensed: false,
      script_checked_at: "2026-04-08T12:00:00Z",
    }));
    expectGuardedUpdate("test.com");
  });

  it("sets not_installed when removed is true", async () => {
    const res = await POST(makeRequest({
      domain: "test.com",
      removed: true,
      method: "not_found",
      checkedAt: "2026-04-08T12:00:00Z",
    }));

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "not_installed", script_installed: false }));
    expect(loadOwnersForDomain).not.toHaveBeenCalled();
    expectGuardedUpdate("test.com");
  });

  it("sets check_failed with error when removed is null", async () => {
    const res = await POST(makeRequest({
      domain: "test.com",
      removed: null,
      method: null,
      error: "Site returned HTTP 403",
      checkedAt: "2026-04-08T12:00:00Z",
    }));

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: "check_failed",
      script_installed: null,
      check_error: "Site returned HTTP 403",
    }));
    expectGuardedUpdate("test.com");
  });

  it("returns 200 ignored if domain not found in DB", async () => {
    mockSelect.mockResolvedValue({ data: [], error: null });

    const res = await POST(makeRequest({
      domain: "nonexistent.com",
      removed: false,
      checkedAt: "2026-04-08T12:00:00Z",
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, ignored: true });
  });

  it("returns 500 on a database error so the checker retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockSelect.mockResolvedValue({ data: null, error: { code: "57014", message: "statement timeout" } });

    const res = await POST(makeRequest({ domain: "test.com", removed: true }));

    expect(res.status).toBe(500);
  });

  it("writes licensed with the owner's account when a paying owner exists", async () => {
    vi.mocked(loadOwnersForDomain).mockResolvedValue([owner()]);

    const res = await POST(makeRequest({ domain: "test.com", removed: false, checkedAt: "2026-04-08T12:00:00Z" }));

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: "licensed",
      is_licensed: true,
      script_installed: true,
      account_id: "acc_pay",
      account_name: "Paying Co",
      account_email: "ops@paying.com",
    }));
    expectGuardedUpdate("test.com");
  });

  it("stores the first owner's account on confirmed_unlicensed", async () => {
    const lapsed = owner({ accountId: "acc_old", accountEmail: "old@test.com", accountPaying: false, latestStatus: "cancelled" });
    vi.mocked(loadOwnersForDomain).mockResolvedValue([lapsed]);

    await POST(makeRequest({ domain: "test.com", removed: false }));

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: "confirmed_unlicensed",
      account_id: "acc_old",
      account_email: "old@test.com",
    }));
  });

  it("returns ignored when the row is no longer pending_check", async () => {
    mockSelect.mockResolvedValue({ data: [], error: null });

    const res = await POST(makeRequest({ domain: "test.com", removed: false }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, ignored: true });
  });

  it("writes shared_host for a shared hosting domain without an owner lookup", async () => {
    const res = await POST(makeRequest({ domain: "acme.webflow.io", removed: false }));

    expect(res.status).toBe(200);
    expect(loadOwnersForDomain).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "shared_host", is_licensed: false }));
    expectGuardedUpdate("acme.webflow.io");
  });

  it("returns 500 and writes nothing when the owner lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(loadOwnersForDomain).mockRejectedValue(new Error("db down"));

    const res = await POST(makeRequest({ domain: "test.com", removed: false }));

    expect(res.status).toBe(500);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
