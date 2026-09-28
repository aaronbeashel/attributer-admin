import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();

// The real session helper runs against a mocked Supabase session client
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getUser } })),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/sites/edit-site-address", () => ({ editSiteAddress: vi.fn() }));
vi.mock("@/lib/external/blocklist", () => ({
  blockDomain: vi.fn(),
  unblockDomain: vi.fn(),
  checkBlockedDomainsStrict: vi.fn(),
}));

import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/account/[id]/sites/[siteId]/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { editSiteAddress, type EditSiteResult } from "@/lib/sites/edit-site-address";

const params = Promise.resolve({ id: "acc_123", siteId: "site_1" });
const body = { websiteUrl: "https://www.acmeroofing.com", expectedDomain: "acmeroofng.com" };

function makeRequest(payload: unknown = body, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/account/acc_123/sites/site_1", {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

function signedInAs(email: string | null) {
  getUser.mockResolvedValue({ data: { user: email ? { email } : null }, error: null });
}

describe("PATCH /api/account/[id]/sites/[siteId]", () => {
  const client = { from: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAILS = "admin@example.com";
    signedInAs("Admin@Example.com");
    vi.mocked(createSupabaseAdminClient).mockReturnValue(client as never);
    vi.mocked(editSiteAddress).mockResolvedValue({
      kind: "saved",
      site: { id: "site_1", domain: "acmeroofing.com", websiteUrl: "https://www.acmeroofing.com" },
      unblock: "not_blocked",
      eventLogged: true,
      unblockRecorded: true,
    });
  });

  describe("needs an admin session", () => {
    it("returns 401 with no session", async () => {
      signedInAs(null);

      const res = await PATCH(makeRequest(), { params });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
      expect(editSiteAddress).not.toHaveBeenCalled();
    });

    it("returns 401 with a valid admin API key but no session", async () => {
      signedInAs(null);

      const res = await PATCH(makeRequest(body, { authorization: `Bearer ${process.env.ADMIN_API_KEY}` }), { params });

      expect(res.status).toBe(401);
      expect(editSiteAddress).not.toHaveBeenCalled();
    });

    it("returns 401 for a signed-in user who isn't an admin", async () => {
      signedInAs("someone@else.com");

      const res = await PATCH(makeRequest(), { params });

      expect(res.status).toBe(401);
      expect(editSiteAddress).not.toHaveBeenCalled();
    });
  });

  it.each([
    ["not JSON", "{"],
    ["no websiteUrl", { expectedDomain: "acmeroofng.com" }],
    ["a missing expectedDomain", { websiteUrl: "https://acmeroofing.com" }],
    ["a numeric websiteUrl", { websiteUrl: 42, expectedDomain: null }],
    ["a non-string confirmedDomain", { ...body, confirmedDomain: true }],
  ])("returns 400 for %s", async (_label, payload) => {
    const res = await PATCH(makeRequest(payload), { params });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request" });
    expect(editSiteAddress).not.toHaveBeenCalled();
  });

  it("passes the admin client, the ids, the body and the admin's email to editSiteAddress", async () => {
    await PATCH(makeRequest({ ...body, confirmedDomain: "acmeroofing.com" }), { params });

    expect(editSiteAddress).toHaveBeenCalledWith(client, {
      accountId: "acc_123",
      siteId: "site_1",
      websiteUrl: "https://www.acmeroofing.com",
      expectedDomain: "acmeroofng.com",
      confirmedDomain: "acmeroofing.com",
      actor: "admin@example.com",
    });
  });

  it("sends a null confirmedDomain when there isn't one, and accepts a null expectedDomain", async () => {
    await PATCH(makeRequest({ websiteUrl: "acmeroofing.com", expectedDomain: null }), { params });

    expect(editSiteAddress).toHaveBeenCalledWith(client, expect.objectContaining({ expectedDomain: null, confirmedDomain: null }));
  });

  it("returns 200 with the outcome when saved", async () => {
    vi.mocked(editSiteAddress).mockResolvedValue({
      kind: "saved",
      site: { id: "site_1", domain: "acmeroofing.com", websiteUrl: "https://www.acmeroofing.com" },
      unblock: "unblocked",
      eventLogged: false,
      unblockRecorded: false,
    });

    const res = await PATCH(makeRequest(), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      site: { id: "site_1", domain: "acmeroofing.com", websiteUrl: "https://www.acmeroofing.com" },
      unblock: "unblocked",
      eventLogged: false,
      unblockRecorded: false,
    });
  });

  it("returns 409 with needsConfirmation and the conflicts", async () => {
    const conflicts = [
      { domain: "shop.acmeroofing.com", accountEmail: "shop@acmeroofing.com", status: "active", paying: true, latestStatus: "active", sameAccount: false },
    ];
    vi.mocked(editSiteAddress).mockResolvedValue({ kind: "needs_confirmation", message: "acmeroofing.com is also used by ...", conflicts });

    const res = await PATCH(makeRequest(), { params });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ needsConfirmation: true, message: "acmeroofing.com is also used by ...", conflicts });
  });

  it.each([
    [{ kind: "refused", status: 400, message: "Not saved. That isn't a valid website address." }],
    [{ kind: "refused", status: 404, message: "Site not found." }],
    [{ kind: "refused", status: 409, message: "Not saved. This site's address changed since you opened it. Refresh and try again." }],
    [{ kind: "error", status: 500, message: "Not saved. The database didn't accept the change. Try again." }],
    [{ kind: "error", status: 503, message: "Not saved. We couldn't check the records, so nothing was changed. Try again." }],
  ] as Array<[EditSiteResult & { status: number; message: string }]>)("maps a %o result to its status and error", async (result) => {
    vi.mocked(editSiteAddress).mockResolvedValue(result);

    const res = await PATCH(makeRequest(), { params });

    expect(res.status).toBe(result.status);
    expect(await res.json()).toEqual({ error: result.message });
  });

  it("returns 500 without claiming nothing saved when editSiteAddress throws", async () => {
    vi.mocked(editSiteAddress).mockRejectedValue(new Error("boom"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await PATCH(makeRequest(), { params });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Something went wrong. Refresh the page to see whether it saved." });
    consoleError.mockRestore();
  });
});
