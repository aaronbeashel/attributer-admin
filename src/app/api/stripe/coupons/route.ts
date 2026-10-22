import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { getStripeServer } from "@/lib/stripe";

export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = getStripeServer();
  const coupons = await stripe.coupons.list({ limit: 50 });

  return NextResponse.json({
    coupons: coupons.data
      .filter((c) => c.valid)
      .map((c) => ({
        id: c.id,
        name: c.name,
        percentOff: c.percent_off,
        amountOff: c.amount_off,
        currency: c.currency,
        duration: c.duration,
        durationInMonths: c.duration_in_months,
        timesRedeemed: c.times_redeemed,
        maxRedemptions: c.max_redemptions,
      })),
  });
}
