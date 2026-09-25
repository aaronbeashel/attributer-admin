import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ verifyAdminApiKey: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/event-logger", () => ({ logEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/external/blocklist", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/external/blocklist")>()),
  blockDomain: vi.fn(),
  unblockDomain: vi.fn(),
}));
vi.mock("@/lib/licensing/block-guard", () => ({ checkBlockAllowed: vi.fn() }));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/account/[id]/sites/[siteId]/cancel/route";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/event-logger";
import { blockDomain } from "@/lib/external/blocklist";
import { checkBlockAllowed } from "@/lib/licensing/block-guard";
import { createMockSupabaseClient } from "../../__mocks__/supabase";

const params = Promise.resolve({ id: "acc_123", siteId: "site_1" });

function makeRequest() {
  return new NextRequest("http://localhost/api/account/acc_123/sites/site_1/cancel", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test-admin-key-12345" },
    body: JSON.stringify({ reason: "Other", feedback: "Cancelled manually by Admin" }),
  });
}

describe("POST /api/account/[id]/sites/[siteId]/cancel", () => {
  let client: ReturnType<typeof createMockSupabaseClient>;

  function withSite(domain: string | null) {
    client._setResult("sites", { data: { id: "site_1", name: "Main", domain, status: "active" }, error: null });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockSupabaseClient();
    withSite("www.acme.com");
    vi.mocked(createSupabaseAdminClient).mockReturnValue(client as never);
    vi.mocked(verifyAdminApiKey).mockReturnValue(true);
    vi.mocked(checkBlockAllowed).mockResolvedValue({ ok: true, domain: "acme.com" });
    vi.mocked(blockDomain).mockResolvedValue({ success: true });
  });

  it("blocks the domain and records it when the guard allows", async () => {
    const res = await POST(makeRequest(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, domainBlocked: true });
    expect(client.from("sites").update).toHaveBeenCalledWith(expect.objectContaining({ status: "inactive" }));
    expect(checkBlockAllowed).toHaveBeenCalledWith(expect.anything(), "www.acme.com", {});
    expect(blockDomain).toHaveBeenCalledWith("acme.com", "Site cancelled");
    expect(client.from("licensing_domains").upsert).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "acme.com", status: "blocked", is_blocked: true }),
      { onConflict: "domain" }
    );
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "site_removed" }));
  });

  it("keeps the site cancel but doesn't block when the guard refuses", async () => {
    const error = "Not blocked. ops@acme.com pays for Attributer but has no active sites. Check the account before blocking.";
    vi.mocked(checkBlockAllowed).mockResolvedValue({ ok: false, status: 409, error });

    const res = await POST(makeRequest(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, domainBlocked: false, blockSkippedReason: error });
    expect(client.from("sites").update).toHaveBeenCalledWith(expect.objectContaining({ status: "inactive" }));
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "site_removed" }));
    expect(blockDomain).not.toHaveBeenCalled();
    expect(client.from("licensing_domains").upsert).not.toHaveBeenCalled();
  });

  it("doesn't record blocked when the licensing server rejects the block", async () => {
    vi.mocked(blockDomain).mockResolvedValue({ success: false });

    const body = await (await POST(makeRequest(), { params })).json();

    expect(body).toEqual({
      success: true,
      domainBlocked: false,
      blockSkippedReason: "Not blocked. The licensing server didn't accept the block. Try again.",
    });
    expect(client.from("licensing_domains").upsert).not.toHaveBeenCalled();
  });

  it("says so when licensing server writes are disabled", async () => {
    vi.mocked(blockDomain).mockResolvedValue({ success: false, reason: "disabled" });

    const body = await (await POST(makeRequest(), { params })).json();

    expect(body.blockSkippedReason).toBe("Licensing server writes are disabled in this environment.");
    expect(client.from("licensing_domains").upsert).not.toHaveBeenCalled();
  });

  it("logs site_removed before running the guard", async () => {
    await POST(makeRequest(), { params });
    const logOrder = vi.mocked(logEvent).mock.invocationCallOrder[0];
    const guardOrder = vi.mocked(checkBlockAllowed).mock.invocationCallOrder[0];
    expect(logOrder).toBeLessThan(guardOrder);
  });

  it("skips the licensing step for a site with no domain", async () => {
    withSite(null);

    const body = await (await POST(makeRequest(), { params })).json();

    expect(body).toEqual({ success: true, domainBlocked: false });
    expect(checkBlockAllowed).not.toHaveBeenCalled();
    expect(blockDomain).not.toHaveBeenCalled();
  });
});
