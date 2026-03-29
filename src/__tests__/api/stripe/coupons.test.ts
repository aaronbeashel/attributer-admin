import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ verifyAdminApiKey: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  getStripeServer: vi.fn().mockReturnValue({
    coupons: { list: vi.fn() },
  }),
}));

import { GET } from "@/app/api/stripe/coupons/route";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { getStripeServer } from "@/lib/stripe";

const makeRequest = () =>
  new Request("http://localhost/api/stripe/coupons", {
    headers: { authorization: "Bearer test-admin-key-12345" },
  });

describe("GET /api/stripe/coupons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdminApiKey).mockReturnValue(true);
  });

  it("returns 401 when API key is invalid", async () => {
    vi.mocked(verifyAdminApiKey).mockReturnValue(false);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns only valid coupons", async () => {
    vi.mocked(getStripeServer().coupons.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        { id: "c1", name: "20% off", valid: true, percent_off: 20, amount_off: null, currency: null, duration: "forever", duration_in_months: null, times_redeemed: 5, max_redemptions: null },
        { id: "c2", name: "Expired", valid: false, percent_off: 10, amount_off: null, currency: null, duration: "once", duration_in_months: null, times_redeemed: 0, max_redemptions: 1 },
      ],
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.coupons).toHaveLength(1);
    expect(body.coupons[0].id).toBe("c1");
    expect(body.coupons[0].percentOff).toBe(20);
  });
});
