import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ verifyAdminApiKey: vi.fn() }));
vi.mock("@/lib/account-helpers", () => ({ getAccountWithSubscription: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ cancelSubscription: vi.fn() }));
vi.mock("@/lib/event-logger", () => ({ logEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }),
  }),
}));

import { PUT } from "@/app/api/account/[id]/status/route";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { getAccountWithSubscription } from "@/lib/account-helpers";
import { cancelSubscription } from "@/lib/stripe";
import { logEvent } from "@/lib/event-logger";
import { MOCK_ACCOUNT_WITH_SUB, MOCK_ACCOUNT_CANCELLED } from "../../__mocks__/fixtures/account";

const makeRequest = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/account/acc_123/status", {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: "Bearer test-admin-key-12345" },
    body: JSON.stringify(body),
  });

const mockParams = Promise.resolve({ id: "acc_123" });

describe("PUT /api/account/[id]/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdminApiKey).mockReturnValue(true);
    vi.mocked(getAccountWithSubscription).mockResolvedValue(MOCK_ACCOUNT_WITH_SUB);
    vi.mocked(cancelSubscription).mockResolvedValue({} as never);
  });

  it("returns 401 when API key is invalid", async () => {
    vi.mocked(verifyAdminApiKey).mockReturnValue(false);
    const res = await PUT(makeRequest({}), { params: mockParams });
    expect(res.status).toBe(401);
  });

  it("returns 404 when no subscription found", async () => {
    vi.mocked(getAccountWithSubscription).mockResolvedValue({
      account: MOCK_ACCOUNT_WITH_SUB.account,
      subscription: null,
    });
    const res = await PUT(makeRequest({}), { params: mockParams });
    expect(res.status).toBe(404);
  });

  it("returns 409 when already cancelled", async () => {
    vi.mocked(getAccountWithSubscription).mockResolvedValue(MOCK_ACCOUNT_CANCELLED);
    const res = await PUT(makeRequest({}), { params: mockParams });
    expect(res.status).toBe(409);
  });

  it("cancels immediately by default", async () => {
    const res = await PUT(makeRequest({ reason: "Too expensive" }), { params: mockParams });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("cancelled");
    expect(cancelSubscription).toHaveBeenCalledWith("sub_stripe_123", false);
  });

  it("cancels at period end when requested", async () => {
    const res = await PUT(makeRequest({ atPeriodEnd: true, reason: "No longer needed" }), { params: mockParams });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("cancel_scheduled");
    expect(cancelSubscription).toHaveBeenCalledWith("sub_stripe_123", true);
  });

  it("logs cancellation event", async () => {
    await PUT(makeRequest({ reason: "Too expensive" }), { params: mockParams });

    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acc_123",
        eventType: "subscription_cancelled",
        source: "api",
      })
    );
  });

  it("returns 400 when no Stripe subscription ID", async () => {
    vi.mocked(getAccountWithSubscription).mockResolvedValue({
      account: MOCK_ACCOUNT_WITH_SUB.account,
      subscription: { ...MOCK_ACCOUNT_WITH_SUB.subscription!, stripe_subscription_id: null },
    });
    const res = await PUT(makeRequest({}), { params: mockParams });
    expect(res.status).toBe(400);
  });
});
