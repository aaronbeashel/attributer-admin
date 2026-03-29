import { NextResponse } from "next/server";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { getAccountWithSubscription } from "@/lib/account-helpers";
import { getStripeServer, listInvoices, updateSubscriptionPlan } from "@/lib/stripe";
import { logEvent } from "@/lib/event-logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPlanById, getPriceForBillingPeriod } from "@/config/plans";
import type Stripe from "stripe";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await getAccountWithSubscription(id);

  if (!result?.subscription) {
    return NextResponse.json({ error: "No subscription found" }, { status: 404 });
  }

  const { subscription } = result;

  let invoices: Awaited<ReturnType<typeof listInvoices>> = [];
  if (subscription.stripe_customer_id) {
    invoices = await listInvoices(subscription.stripe_customer_id);
  }

  let stripeSubscription = null;
  if (subscription.stripe_subscription_id) {
    const stripe = getStripeServer();
    try {
      const sub = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
      stripeSubscription = {
        status: sub.status,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        discount: (() => {
            const d = (sub.discounts as any)?.[0];
            const coupon = d?.coupon;
            if (!coupon) return null;
            return {
              couponId: coupon.id,
              couponName: coupon.name,
              percentOff: coupon.percent_off,
              amountOff: coupon.amount_off,
            };
          })(),
      };
    } catch {
      // Subscription may not exist if cancelled
    }
  }

  return NextResponse.json({
    subscription: {
      id: subscription.id,
      status: subscription.status,
      planId: subscription.plan_id,
      planName: subscription.plan_name,
      planPriceCents: subscription.plan_price_cents,
      planCurrency: subscription.plan_currency,
      trialType: subscription.trial_type,
      trialEndsAt: subscription.trial_ends_at,
      siteLimit: subscription.site_limit,
      leadLimit: subscription.lead_limit,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      delinquentSince: subscription.delinquent_since,
      stripeCustomerId: subscription.stripe_customer_id,
      stripeSubscriptionId: subscription.stripe_subscription_id,
      createdAt: subscription.created_at,
    },
    stripe: stripeSubscription,
    invoices: invoices.slice(0, 6),
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();

    if (!body.newPlanId) {
      return NextResponse.json({ error: "newPlanId is required" }, { status: 400 });
    }

    const result = await getAccountWithSubscription(id);
    if (!result?.subscription) {
      return NextResponse.json({ error: "No subscription found" }, { status: 404 });
    }

    const { subscription } = result;
    const newPlan = getPlanById(body.newPlanId);
    if (!newPlan) {
      return NextResponse.json({ error: "Invalid plan ID" }, { status: 400 });
    }

    if (!subscription.stripe_subscription_id) {
      return NextResponse.json({ error: "No Stripe subscription" }, { status: 400 });
    }

    const billingPeriod = body.billingPeriod || "monthly";
    const pricing = getPriceForBillingPeriod(newPlan, billingPeriod);

    // Calculate quantity for enterprise plans
    let quantity: number | undefined;
    if (body.newPlanId === "enterprise" && body.leadLimit) {
      quantity = Math.ceil(body.leadLimit / 1000);
    }

    await updateSubscriptionPlan({
      subscriptionId: subscription.stripe_subscription_id,
      newPriceId: pricing.stripe_price_id,
      quantity,
      prorate: body.prorate !== false,
    });

    const actualPriceCents =
      body.newPlanId === "enterprise" && quantity
        ? 10000 * quantity
        : pricing.amount_cents;

    // Update local DB
    const supabase = createSupabaseAdminClient();
    await supabase
      .from("subscriptions")
      .update({
        plan_id: newPlan.id,
        plan_name: newPlan.name,
        plan_price_cents: actualPriceCents,
        site_limit: newPlan.site_limit,
        lead_limit: body.leadLimit || newPlan.lead_limit,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscription.id);

    await logEvent({
      accountId: id,
      eventType: "plan_changed",
      metadata: {
        oldPlanId: subscription.plan_id,
        newPlanId: newPlan.id,
        newPriceCents: actualPriceCents,
        billingPeriod,
        prorate: body.prorate !== false,
        initiatedBy: "admin",
        supportCaseId: body.supportCaseId,
      },
      source: "api",
    });

    return NextResponse.json({
      success: true,
      plan: {
        id: newPlan.id,
        name: newPlan.name,
        priceCents: actualPriceCents,
        siteLimit: newPlan.site_limit,
        leadLimit: body.leadLimit || newPlan.lead_limit,
      },
    });
  } catch (err) {
    const stripeError = err as Stripe.errors.StripeError;
    if (stripeError?.type) {
      return NextResponse.json(
        { error: stripeError.message, code: stripeError.code, type: stripeError.type },
        { status: 400 }
      );
    }
    console.error(`[API] PUT /api/account/${id}/subscription:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
