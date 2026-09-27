import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/external/blocklist", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/external/blocklist")>()),
  blockDomain: vi.fn(),
  unblockDomain: vi.fn(),
}));
vi.mock("@/lib/licensing/block-guard", () => ({ checkBlockAllowed: vi.fn() }));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/licensing/action/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { blockDomain, unblockDomain } from "@/lib/external/blocklist";
import { checkBlockAllowed } from "@/lib/licensing/block-guard";
import { createMockSupabaseClient } from "../../__mocks__/supabase";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/licensing/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/licensing/action", () => {
  let client: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockSupabaseClient();
    vi.mocked(createSupabaseAdminClient).mockReturnValue(client as never);
    vi.mocked(checkBlockAllowed).mockResolvedValue({ ok: true, domain: "acme.com" });
    vi.mocked(blockDomain).mockResolvedValue({ success: true });
    vi.mocked(unblockDomain).mockResolvedValue({ success: true });
  });

  const domainsTable = () => client.from("licensing_domains");

  it("returns 400 for an invalid request", async () => {
    expect((await POST(makeRequest({ domain: "acme.com", action: "nuke" }))).status).toBe(400);
    expect((await POST(makeRequest({ action: "blocked" }))).status).toBe(400);
    expect((await POST(makeRequest({ domain: "https://", action: "blocked" }))).status).toBe(400);
    expect(blockDomain).not.toHaveBeenCalled();
  });

  it.each([
    [409, "Not blocked. acme.com belongs to a paying customer (ops@acme.com, Starter)."],
    [503, "Not blocked. We couldn't check who owns acme.com, so nothing was changed. Try again."],
    [400, "Not blocked. That isn't a valid domain."],
  ] as const)("passes a %s guard refusal through and sends nothing", async (status, error) => {
    vi.mocked(checkBlockAllowed).mockResolvedValue({ ok: false, status, error });

    const res = await POST(makeRequest({ domain: "acme.com", action: "blocked" }));

    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
    expect(blockDomain).not.toHaveBeenCalled();
    expect(domainsTable().upsert).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalledWith("licensing_reviews");
  });

  it("returns 502 and writes nothing when the licensing server rejects the block", async () => {
    vi.mocked(blockDomain).mockResolvedValue({ success: false });

    const res = await POST(makeRequest({ domain: "acme.com", action: "blocked" }));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Not blocked. The licensing server didn't accept the block. Try again." });
    expect(domainsTable().upsert).not.toHaveBeenCalled();
  });

  it("says so when licensing server writes are disabled", async () => {
    vi.mocked(blockDomain).mockResolvedValue({ success: false, reason: "disabled" });

    const res = await POST(makeRequest({ domain: "acme.com", action: "blocked" }));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Licensing server writes are disabled in this environment." });
    expect(domainsTable().upsert).not.toHaveBeenCalled();
  });

  it("returns 502 and writes nothing when the licensing server rejects the unblock", async () => {
    vi.mocked(unblockDomain).mockResolvedValue({ success: false });

    const res = await POST(makeRequest({ domain: "acme.com", action: "unblocked" }));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Not unblocked. The licensing server didn't accept the change. Try again." });
    expect(domainsTable().update).not.toHaveBeenCalled();
    expect(checkBlockAllowed).not.toHaveBeenCalled();
  });

  it("blocks and records it on the happy path", async () => {
    const res = await POST(makeRequest({ domain: "acme.com", action: "blocked", reason: "Unlicensed usage" }));

    expect(res.status).toBe(200);
    expect(blockDomain).toHaveBeenCalledWith("acme.com", "Unlicensed usage");
    expect(domainsTable().upsert).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "acme.com", status: "blocked", is_blocked: true, reviewed_by: "admin" }),
      { onConflict: "domain" }
    );
    expect(client.from("licensing_reviews").insert).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "acme.com", action: "blocked" })
    );
  });

  it("normalises the domain once and uses it for the guard, the server and the writes", async () => {
    await POST(makeRequest({ domain: " https://WWW.Acme.com/pricing ", action: "blocked", excludeAccountId: "acc_1" }));

    expect(checkBlockAllowed).toHaveBeenCalledWith(expect.anything(), "acme.com", { excludeAccountId: "acc_1" });
    expect(blockDomain).toHaveBeenCalledWith("acme.com", "Unlicensed usage");
    expect(domainsTable().upsert).toHaveBeenCalledWith(expect.objectContaining({ domain: "acme.com" }), { onConflict: "domain" });
    expect(client.from("licensing_reviews").insert).toHaveBeenCalledWith(expect.objectContaining({ domain: "acme.com" }));
  });

  it("unblocks and resets the row on the happy path", async () => {
    const res = await POST(makeRequest({ domain: "Acme.com", action: "unblocked" }));

    expect(res.status).toBe(200);
    expect(unblockDomain).toHaveBeenCalledWith("acme.com");
    expect(domainsTable().update).toHaveBeenCalledWith(expect.objectContaining({ status: "pending_check", is_blocked: false }));
    expect(domainsTable().eq).toHaveBeenCalledWith("domain", "acme.com");
  });

  it("dismisses without the guard or the licensing server", async () => {
    const res = await POST(makeRequest({ domain: "acme.com", action: "dismissed" }));

    expect(res.status).toBe(200);
    expect(checkBlockAllowed).not.toHaveBeenCalled();
    expect(blockDomain).not.toHaveBeenCalled();
    expect(domainsTable().upsert).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "acme.com", status: "dismissed", is_blocked: false }),
      { onConflict: "domain" }
    );
  });
});
