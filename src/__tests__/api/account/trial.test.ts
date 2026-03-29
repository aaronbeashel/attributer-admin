import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ verifyAdminApiKey: vi.fn() }));
vi.mock("@/lib/account-helpers", () => ({ getAccountWithSubscription: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  getStripeServer: vi.fn().mockReturnValue({
    subscriptions: { update: vi.fn().mockResolvedValue({}) },
  }),
}));
vi.mock("@/lib/event-logger", () => ({ logEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }),
  }),
}));

import { PUT } from "@/app/api/account/[id]/trial/route";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { getAccountWithSubscription } from "@/lib/account-helpers";
import { MOCK_ACCOUNT_WITH_SUB, MOCK_ACCOUNT_WITH_TRIAL } from "../../__mocks__/fixtures/account";

const makeRequest = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/account/acc_123/trial", {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: "Bearer test-admin-key-12345" },
    body: JSON.stringify(body),
  });

const mockParams = Promise.resolve({ id: "acc_123" });

describe("PUT /api/account/[id]/trial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdminApiKey).mockReturnValue(true);
    vi.mocked(getAccountWithSubscription).mockResolvedValue(MOCK_ACCOUNT_WITH_TRIAL);
  });

  it("returns 401 when API key is invalid", async () => {
    vi.mocked(verifyAdminApiKey).mockReturnValue(false);
    const res = await PUT(makeRequest({ days: 7 }), { params: mockParams });
    expect(res.status).toBe(401);
  });

  it("returns 400 when account is not on trial", async () => {
    vi.mocked(getAccountWithSubscription).mockResolvedValue(MOCK_ACCOUNT_WITH_SUB);
    const res = await PUT(makeRequest({ days: 7 }), { params: mockParams });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.currentStatus).toBe("active");
  });

  it("extends trial by specified days", async () => {
    const res = await PUT(makeRequest({ days: 14 }), { params: mockParams });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.trial.previousEnd).toBe("2025-04-15T00:00:00Z");
    // New end should be 14 days after current trial end
    const newEnd = new Date(body.trial.newEnd);
    const expected = new Date("2025-04-15T00:00:00Z");
    expected.setDate(expected.getDate() + 14);
    expect(newEnd.toISOString().split("T")[0]).toBe(expected.toISOString().split("T")[0]);
  });

  it("defaults to 7 days when no days specified", async () => {
    const res = await PUT(makeRequest({}), { params: mockParams });
    expect(res.status).toBe(200);

    const body = await res.json();
    const newEnd = new Date(body.trial.newEnd);
    const expected = new Date("2025-04-15T00:00:00Z");
    expected.setDate(expected.getDate() + 7);
    expect(newEnd.toISOString().split("T")[0]).toBe(expected.toISOString().split("T")[0]);
  });

  it("accepts explicit newTrialEnd date", async () => {
    const res = await PUT(makeRequest({ newTrialEnd: "2025-05-01T00:00:00Z" }), { params: mockParams });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(new Date(body.trial.newEnd).toISOString()).toBe("2025-05-01T00:00:00.000Z");
  });

  it("returns 404 when no subscription found", async () => {
    vi.mocked(getAccountWithSubscription).mockResolvedValue({
      account: MOCK_ACCOUNT_WITH_TRIAL.account,
      subscription: null,
    });
    const res = await PUT(makeRequest({ days: 7 }), { params: mockParams });
    expect(res.status).toBe(404);
  });
});
