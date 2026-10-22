import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getUser } })),
}));

import { getAdminSessionEmail, isAdminRequest } from "@/lib/admin-session";
import { parseAdminEmails } from "@/lib/admin-auth";

function signedInAs(email: string | null) {
  getUser.mockResolvedValue({ data: { user: email ? { email } : null }, error: null });
}

describe("getAdminSessionEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAILS = "admin@example.com, Second@Example.com";
  });

  it("returns the lowercased email of a signed-in admin", async () => {
    signedInAs("admin@example.com");
    expect(await getAdminSessionEmail()).toBe("admin@example.com");
  });

  it("matches admin emails case-insensitively on both sides", async () => {
    signedInAs("SECOND@example.COM");
    expect(await getAdminSessionEmail()).toBe("second@example.com");
  });

  it("returns null for a signed-in user who isn't an admin", async () => {
    signedInAs("someone@else.com");
    expect(await getAdminSessionEmail()).toBeNull();
  });

  it("returns null with no session", async () => {
    signedInAs(null);
    expect(await getAdminSessionEmail()).toBeNull();
  });

  it("returns null for a user with no email, even when ADMIN_EMAILS has an empty entry", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com,";
    getUser.mockResolvedValue({ data: { user: { email: undefined } }, error: null });
    expect(await getAdminSessionEmail()).toBeNull();
  });

  it("returns null when the session can't be read", async () => {
    getUser.mockRejectedValue(new Error("network down"));
    expect(await getAdminSessionEmail()).toBeNull();
  });
});

describe("parseAdminEmails", () => {
  it("splits, trims and lowercases", () => {
    expect(parseAdminEmails(" A@x.com ,b@Y.com")).toEqual(["a@x.com", "b@y.com"]);
  });
});

describe("isAdminRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAILS = "admin@example.com";
  });

  function request(headers: Record<string, string> = {}) {
    return new Request("http://localhost/api/account/1", { headers });
  }

  it("accepts the admin API key without a session", async () => {
    signedInAs(null);
    expect(await isAdminRequest(request({ authorization: `Bearer ${process.env.ADMIN_API_KEY}` }))).toBe(true);
  });

  it("accepts a signed-in admin with no key", async () => {
    signedInAs("admin@example.com");
    expect(await isAdminRequest(request())).toBe(true);
  });

  it("rejects a wrong key with no admin session", async () => {
    signedInAs("someone@else.com");
    expect(await isAdminRequest(request({ authorization: "Bearer wrong" }))).toBe(false);
  });

  it("rejects a request with neither", async () => {
    signedInAs(null);
    expect(await isAdminRequest(request())).toBe(false);
  });
});
