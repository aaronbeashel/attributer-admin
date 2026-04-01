import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ verifyAdminApiKey: vi.fn() }));
vi.mock("@/lib/account-helpers", () => ({ getAccountWithSubscription: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ updateStripeCustomer: vi.fn() }));
vi.mock("@/lib/event-logger", () => ({ logEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    }),
  }),
}));

import { PUT } from "@/app/api/account/[id]/owner/route";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { getAccountWithSubscription } from "@/lib/account-helpers";
import { updateStripeCustomer } from "@/lib/stripe";
import { logEvent } from "@/lib/event-logger";
import { MOCK_ACCOUNT_WITH_SUB } from "../../__mocks__/fixtures/account";

const makeRequest = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/account/acc_123/owner", {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: "Bearer test-admin-key-12345" },
    body: JSON.stringify(body),
  });

const mockParams = Promise.resolve({ id: "acc_123" });

describe("PUT /api/account/[id]/owner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdminApiKey).mockReturnValue(true);
    vi.mocked(getAccountWithSubscription).mockResolvedValue(MOCK_ACCOUNT_WITH_SUB);
  });

  it("returns 401 when API key is invalid", async () => {
    vi.mocked(verifyAdminApiKey).mockReturnValue(false);
    const res = await PUT(makeRequest({ email: "new@test.com" }), { params: mockParams });
    expect(res.status).toBe(401);
  });

  it("returns 400 when email is missing", async () => {
    const res = await PUT(makeRequest({}), { params: mockParams });
    expect(res.status).toBe(400);
  });

  it("returns 404 when account not found", async () => {
    vi.mocked(getAccountWithSubscription).mockResolvedValue(null);
    const res = await PUT(makeRequest({ email: "new@test.com" }), { params: mockParams });
    expect(res.status).toBe(404);
  });

  it("transfers ownership and syncs to Stripe", async () => {
    const res = await PUT(
      makeRequest({ email: "new@test.com", firstName: "New", lastName: "Owner", company: "New Corp" }),
      { params: mockParams }
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.previousEmail).toBe("test@example.com");
    expect(body.account.email).toBe("new@test.com");

    expect(updateStripeCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "cus_stripe_123", email: "new@test.com", name: "New Owner" })
    );
  });

  it("logs ownership transfer event", async () => {
    await PUT(makeRequest({ email: "new@test.com" }), { params: mockParams });
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "ownership_transferred",
        metadata: expect.objectContaining({ oldEmail: "test@example.com", newEmail: "new@test.com" }),
      })
    );
  });
});
