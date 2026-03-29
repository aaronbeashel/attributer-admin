import { NextResponse } from "next/server";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { getAccountWithSubscription } from "@/lib/account-helpers";
import { getStripeServer } from "@/lib/stripe";
import { logEvent } from "@/lib/event-logger";
import type Stripe from "stripe";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();

    if (!body.couponId) {
      return NextResponse.json({ error: "couponId is required" }, { status: 400 });
    }

    const result = await getAccountWithSubscription(id);
    if (!result?.subscription?.stripe_subscription_id) {
      return NextResponse.json({ error: "No active subscription" }, { status: 404 });
    }

    const stripe = getStripeServer();
    const updated = await stripe.subscriptions.update(
      result.subscription.stripe_subscription_id,
      { discounts: [{ coupon: body.couponId }] }
    );

    await logEvent({
      accountId: id,
      eventType: "discount_applied",
      metadata: {
        couponId: body.couponId,
        subscriptionId: result.subscription.stripe_subscription_id,
        supportCaseId: body.supportCaseId,
        initiatedBy: "admin",
      },
      source: "api",
    });

    // Retrieve the updated subscription with discounts expanded to get coupon details
    const expanded = await stripe.subscriptions.retrieve(
      result.subscription.stripe_subscription_id,
      { expand: ["discounts.coupon"] }
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstDiscount = (expanded.discounts as any)?.[0];
    const coupon = firstDiscount?.coupon;

    return NextResponse.json({
      success: true,
      discount: coupon
        ? {
            couponId: coupon.id,
            couponName: coupon.name,
            percentOff: coupon.percent_off,
            amountOff: coupon.amount_off,
          }
        : null,
    });
  } catch (err) {
    const stripeError = err as Stripe.errors.StripeError;
    if (stripeError?.type) {
      return NextResponse.json(
        { error: stripeError.message, code: stripeError.code, type: stripeError.type },
        { status: 400 }
      );
    }
    console.error(`[API] POST /api/account/${id}/discount:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
