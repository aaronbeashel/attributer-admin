import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser } })),
}));

import { updateSession } from "@/lib/supabase/middleware";

function request(path: string, method = "GET") {
  return new NextRequest(`https://admin.example.com${path}`, { method });
}

function signedInAs(email: string | null) {
  getUser.mockResolvedValue({ data: { user: email ? { email } : null } });
}

describe("updateSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAILS = "admin@example.com, second@example.com";
  });

  describe("licensing API routes need an admin session", () => {
    it.each([
      ["POST", "/api/licensing/action"],
      ["GET", "/api/licensing/domains?status=confirmed_unlicensed"],
      ["GET", "/api/licensing/lookup?domain=example.com"],
      ["POST", "/api/licensing/process"],
      ["GET", "/api/licensing/scans"],
    ])("refuses %s %s with no session", async (method, path) => {
      signedInAs(null);
      const res = await updateSession(request(path, method));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });

    it("refuses a signed-in user who is not an admin", async () => {
      signedInAs("someone@else.com");
      const res = await updateSession(request("/api/licensing/action", "POST"));
      expect(res.status).toBe(401);
    });

    it("lets an admin through, matching email case-insensitively", async () => {
      signedInAs("Second@Example.com");
      const res = await updateSession(request("/api/licensing/action", "POST"));
      expect(res.status).toBe(200);
      expect(res.headers.get("x-middleware-next")).toBe("1");
    });
  });

  describe("routes with their own auth are unchanged", () => {
    it.each([
      "/api/cron/licensing",
      "/api/webhooks/checker",
      "/api/account/abc/status",
      "/api/stripe/anything",
      "/api/auth/callback",
    ])("passes %s through with no session", async (path) => {
      signedInAs(null);
      const res = await updateSession(request(path));
      expect(res.status).toBe(200);
      expect(res.headers.get("x-middleware-next")).toBe("1");
    });
  });

  it("still redirects a signed-out visitor on an admin page to login", async () => {
    signedInAs(null);
    const res = await updateSession(request("/licensing"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://admin.example.com/login");
  });
});
