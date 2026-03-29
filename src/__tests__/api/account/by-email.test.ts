import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ verifyAdminApiKey: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { GET } from "@/app/api/account/by-email/route";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const makeRequest = (email?: string) => {
  const url = email
    ? `http://localhost/api/account/by-email?email=${encodeURIComponent(email)}`
    : "http://localhost/api/account/by-email";
  return new Request(url, {
    headers: { authorization: "Bearer test-admin-key-12345" },
  });
};

describe("GET /api/account/by-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdminApiKey).mockReturnValue(true);
  });

  it("returns 401 when API key is invalid", async () => {
    vi.mocked(verifyAdminApiKey).mockReturnValue(false);
    const res = await GET(makeRequest("test@example.com"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when email is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns 404 when no account found", async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
    };
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(mockChain),
    } as never);

    const res = await GET(makeRequest("nobody@example.com"));
    expect(res.status).toBe(404);
  });

  it("returns account data for valid email", async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "acc_123", email: "test@example.com", name: "Test", company: "Corp" },
        error: null,
      }),
    };
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(mockChain),
    } as never);

    const res = await GET(makeRequest("test@example.com"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.accountId).toBe("acc_123");
    expect(body.email).toBe("test@example.com");
  });
});
