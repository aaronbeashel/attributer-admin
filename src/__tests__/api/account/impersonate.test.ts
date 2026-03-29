import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ verifyAdminApiKey: vi.fn() }));
vi.mock("@/lib/account-helpers", () => ({ getAccountWithSubscription: vi.fn() }));
vi.mock("@/lib/event-logger", () => ({ logEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

import { POST } from "@/app/api/account/[id]/impersonate/route";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { getAccountWithSubscription } from "@/lib/account-helpers";
import { logEvent } from "@/lib/event-logger";
import { MOCK_ACCOUNT_WITH_SUB } from "../../__mocks__/fixtures/account";

const makeRequest = () =>
  new Request("http://localhost/api/account/acc_123/impersonate", {
    method: "POST",
    headers: { authorization: "Bearer test-admin-key-12345" },
  });

const mockParams = Promise.resolve({ id: "acc_123" });

describe("POST /api/account/[id]/impersonate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdminApiKey).mockReturnValue(true);
    vi.mocked(getAccountWithSubscription).mockResolvedValue(MOCK_ACCOUNT_WITH_SUB);
  });

  it("returns 401 when API key is invalid", async () => {
    vi.mocked(verifyAdminApiKey).mockReturnValue(false);
    const res = await POST(makeRequest(), { params: mockParams });
    expect(res.status).toBe(401);
  });

  it("returns 404 when account not found", async () => {
    vi.mocked(getAccountWithSubscription).mockResolvedValue(null);
    const res = await POST(makeRequest(), { params: mockParams });
    expect(res.status).toBe(404);
  });

  it("creates session and returns impersonation URL", async () => {
    const res = await POST(makeRequest(), { params: mockParams });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.url).toContain("http://localhost:3001/api/auth/impersonate?token=");
    expect(body.expiresAt).toBeDefined();
  });

  it("logs impersonation event", async () => {
    await POST(makeRequest(), { params: mockParams });
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "impersonation_started",
        metadata: expect.objectContaining({ userId: "user_456" }),
      })
    );
  });
});
