import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ verifyAdminApiKey: vi.fn() }));
vi.mock("@/lib/account-helpers", () => ({ getAccountWithSubscription: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  getStripeServer: vi.fn().mockReturnValue({
    customers: {
      createBalanceTransaction: vi.fn(),
      retrieve: vi.fn(),
    },
  }),
}));
vi.mock("@/lib/event-logger", () => ({ logEvent: vi.fn().mockResolvedValue(undefined) }));

import { POST } from "@/app/api/account/[id]/credit/route";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { getAccountWithSubscription } from "@/lib/account-helpers";
import { getStripeServer } from "@/lib/stripe";
import { logEvent } from "@/lib/event-logger";
import { MOCK_ACCOUNT_WITH_SUB } from "../../__mocks__/fixtures/account";

const makeRequest = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/account/acc_123/credit", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test-admin-key-12345" },
    body: JSON.stringify(body),
  });

const mockParams = Promise.resolve({ id: "acc_123" });

describe("POST /api/account/[id]/credit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdminApiKey).mockReturnValue(true);
    vi.mocked(getAccountWithSubscription).mockResolvedValue(MOCK_ACCOUNT_WITH_SUB);

    const stripe = getStripeServer();
    vi.mocked(stripe.customers.createBalanceTransaction as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ id: "txn_1" });
    vi.mocked(stripe.customers.retrieve as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ balance: -5000 });
  });

  it("returns 401 when API key is invalid", async () => {
    vi.mocked(verifyAdminApiKey).mockReturnValue(false);
    const res = await POST(makeRequest({ amount: 1000 }), { params: mockParams });
    expect(res.status).toBe(401);
  });

  it("returns 400 when amount is missing", async () => {
    const res = await POST(makeRequest({}), { params: mockParams });
    expect(res.status).toBe(400);
  });

  it("returns 400 when amount is zero", async () => {
    const res = await POST(makeRequest({ amount: 0 }), { params: mockParams });
    expect(res.status).toBe(400);
  });

  it("returns 404 when no Stripe customer", async () => {
    vi.mocked(getAccountWithSubscription).mockResolvedValue({
      account: MOCK_ACCOUNT_WITH_SUB.account,
      subscription: { ...MOCK_ACCOUNT_WITH_SUB.subscription!, stripe_customer_id: null },
    });
    const res = await POST(makeRequest({ amount: 1000 }), { params: mockParams });
    expect(res.status).toBe(404);
  });

  it("applies credit as negative balance", async () => {
    const res = await POST(makeRequest({ amount: 5000, reason: "Downtime compensation" }), { params: mockParams });
    expect(res.status).toBe(200);

    const stripe = getStripeServer();
    expect(stripe.customers.createBalanceTransaction).toHaveBeenCalledWith(
      "cus_stripe_123",
      expect.objectContaining({ amount: -5000, currency: "usd" })
    );

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.credit.amount).toBe(5000);
    expect(body.credit.newBalanceCents).toBe(-5000);
  });

  it("logs event on successful credit", async () => {
    await POST(makeRequest({ amount: 1000 }), { params: mockParams });
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "credit_applied", accountId: "acc_123" })
    );
  });
});
