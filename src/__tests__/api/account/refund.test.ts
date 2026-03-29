import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies before importing the route
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminApiKey: vi.fn(),
}));
vi.mock("@/lib/account-helpers", () => ({
  getAccountWithSubscription: vi.fn(),
}));
vi.mock("@/lib/stripe", () => ({
  getStripeServer: vi.fn().mockReturnValue({
    charges: { retrieve: vi.fn() },
  }),
  createRefund: vi.fn(),
}));
vi.mock("@/lib/event-logger", () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/account/[id]/refund/route";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { getAccountWithSubscription } from "@/lib/account-helpers";
import { getStripeServer, createRefund } from "@/lib/stripe";
import { logEvent } from "@/lib/event-logger";
import { MOCK_ACCOUNT_WITH_SUB } from "../../__mocks__/fixtures/account";

const makeRequest = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/account/acc_123/refund", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test-admin-key-12345" },
    body: JSON.stringify(body),
  });

const mockParams = Promise.resolve({ id: "acc_123" });

describe("POST /api/account/[id]/refund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdminApiKey).mockReturnValue(true);
    vi.mocked(getAccountWithSubscription).mockResolvedValue(MOCK_ACCOUNT_WITH_SUB);
  });

  it("returns 401 when API key is invalid", async () => {
    vi.mocked(verifyAdminApiKey).mockReturnValue(false);
    const res = await POST(makeRequest({ chargeId: "ch_1" }), { params: mockParams });
    expect(res.status).toBe(401);
  });

  it("returns 400 when chargeId is missing", async () => {
    const res = await POST(makeRequest({}), { params: mockParams });
    expect(res.status).toBe(400);
  });

  it("returns 404 when account not found", async () => {
    vi.mocked(getAccountWithSubscription).mockResolvedValue(null);
    const res = await POST(makeRequest({ chargeId: "ch_1" }), { params: mockParams });
    expect(res.status).toBe(404);
  });

  it("returns 409 when charge is already fully refunded", async () => {
    const mockRetrieve = vi.mocked(getStripeServer().charges.retrieve as ReturnType<typeof vi.fn>);
    mockRetrieve.mockResolvedValue({ refunded: true, amount: 4900, amount_refunded: 4900 });

    const res = await POST(makeRequest({ chargeId: "ch_1" }), { params: mockParams });
    expect(res.status).toBe(409);
  });

  it("returns 400 when partial refund exceeds refundable balance", async () => {
    const mockRetrieve = vi.mocked(getStripeServer().charges.retrieve as ReturnType<typeof vi.fn>);
    mockRetrieve.mockResolvedValue({ refunded: false, amount: 4900, amount_refunded: 4000 });

    const res = await POST(makeRequest({ chargeId: "ch_1", amount: 1000 }), { params: mockParams });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.refundable).toBe(900);
  });

  it("processes full refund successfully", async () => {
    const mockRetrieve = vi.mocked(getStripeServer().charges.retrieve as ReturnType<typeof vi.fn>);
    mockRetrieve.mockResolvedValue({ refunded: false, amount: 4900, amount_refunded: 0 });
    vi.mocked(createRefund).mockResolvedValue({
      id: "re_1", amount: 4900, currency: "usd", status: "succeeded",
    } as never);

    const res = await POST(makeRequest({ chargeId: "ch_1" }), { params: mockParams });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.refund.id).toBe("re_1");
    expect(body.refund.amount).toBe(4900);
  });

  it("logs event on successful refund", async () => {
    const mockRetrieve = vi.mocked(getStripeServer().charges.retrieve as ReturnType<typeof vi.fn>);
    mockRetrieve.mockResolvedValue({ refunded: false, amount: 4900, amount_refunded: 0 });
    vi.mocked(createRefund).mockResolvedValue({
      id: "re_1", amount: 4900, currency: "usd", status: "succeeded",
    } as never);

    await POST(makeRequest({ chargeId: "ch_1", reason: "Customer request" }), { params: mockParams });

    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acc_123",
        eventType: "refund_issued",
        source: "api",
      })
    );
  });

  it("passes correct amount for partial refund", async () => {
    const mockRetrieve = vi.mocked(getStripeServer().charges.retrieve as ReturnType<typeof vi.fn>);
    mockRetrieve.mockResolvedValue({ refunded: false, amount: 4900, amount_refunded: 0 });
    vi.mocked(createRefund).mockResolvedValue({
      id: "re_2", amount: 2000, currency: "usd", status: "succeeded",
    } as never);

    await POST(makeRequest({ chargeId: "ch_1", amount: 2000 }), { params: mockParams });

    expect(createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ chargeId: "ch_1", amount: 2000 })
    );
  });
});
