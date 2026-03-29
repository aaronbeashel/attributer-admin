import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ verifyAdminApiKey: vi.fn() }));
vi.mock("@/lib/account-helpers", () => ({ getAccountWithSubscription: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  getStripeServer: vi.fn().mockReturnValue({
    subscriptions: {
      update: vi.fn(),
      retrieve: vi.fn(),
    },
  }),
}));
vi.mock("@/lib/event-logger", () => ({ logEvent: vi.fn().mockResolvedValue(undefined) }));

import { POST } from "@/app/api/account/[id]/discount/route";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { getAccountWithSubscription } from "@/lib/account-helpers";
import { getStripeServer } from "@/lib/stripe";
import { logEvent } from "@/lib/event-logger";
import { MOCK_ACCOUNT_WITH_SUB } from "../../__mocks__/fixtures/account";

const makeRequest = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/account/acc_123/discount", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test-admin-key-12345" },
    body: JSON.stringify(body),
  });

const mockParams = Promise.resolve({ id: "acc_123" });

describe("POST /api/account/[id]/discount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdminApiKey).mockReturnValue(true);
    vi.mocked(getAccountWithSubscription).mockResolvedValue(MOCK_ACCOUNT_WITH_SUB);

    const stripe = getStripeServer();
    vi.mocked(stripe.subscriptions.update as ReturnType<typeof vi.fn>).mockResolvedValue({ discounts: [] });
    vi.mocked(stripe.subscriptions.retrieve as ReturnType<typeof vi.fn>).mockResolvedValue({
      discounts: [{ coupon: { id: "coupon_1", name: "20% off", percent_off: 20, amount_off: null } }],
    });
  });

  it("returns 401 when API key is invalid", async () => {
    vi.mocked(verifyAdminApiKey).mockReturnValue(false);
    const res = await POST(makeRequest({ couponId: "coupon_1" }), { params: mockParams });
    expect(res.status).toBe(401);
  });

  it("returns 400 when couponId is missing", async () => {
    const res = await POST(makeRequest({}), { params: mockParams });
    expect(res.status).toBe(400);
  });

  it("returns 404 when no active subscription", async () => {
    vi.mocked(getAccountWithSubscription).mockResolvedValue({
      account: MOCK_ACCOUNT_WITH_SUB.account,
      subscription: { ...MOCK_ACCOUNT_WITH_SUB.subscription!, stripe_subscription_id: null },
    });
    const res = await POST(makeRequest({ couponId: "coupon_1" }), { params: mockParams });
    expect(res.status).toBe(404);
  });

  it("applies discount and returns coupon details", async () => {
    const res = await POST(makeRequest({ couponId: "coupon_1" }), { params: mockParams });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.discount.couponId).toBe("coupon_1");
    expect(body.discount.percentOff).toBe(20);
  });

  it("logs discount event", async () => {
    await POST(makeRequest({ couponId: "coupon_1" }), { params: mockParams });
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "discount_applied" })
    );
  });
});
