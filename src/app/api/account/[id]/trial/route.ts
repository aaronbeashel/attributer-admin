import { NextResponse } from "next/server";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { getAccountWithSubscription } from "@/lib/account-helpers";
import { getStripeServer } from "@/lib/stripe";
import { logEvent } from "@/lib/event-logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type Stripe from "stripe";

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

    const result = await getAccountWithSubscription(id);
    if (!result?.subscription) {
      return NextResponse.json({ error: "No subscription found" }, { status: 404 });
    }

    const { subscription } = result;

    if (subscription.status !== "trialing") {
      return NextResponse.json(
        { error: "Account is not on a trial", currentStatus: subscription.status },
        { status: 400 }
      );
    }

    // Calculate new trial end date
    let newTrialEnd: Date;
    if (body.newTrialEnd) {
      newTrialEnd = new Date(body.newTrialEnd);
    } else {
      const currentEnd = subscription.trial_ends_at ? new Date(subscription.trial_ends_at) : new Date();
      newTrialEnd = new Date(currentEnd);
      newTrialEnd.setDate(newTrialEnd.getDate() + (body.days || 7));
    }

    // Update Stripe subscription trial end
    if (subscription.stripe_subscription_id) {
      const stripe = getStripeServer();
      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        trial_end: Math.floor(newTrialEnd.getTime() / 1000),
      });
    }

    // Update local DB
    const supabase = createSupabaseAdminClient();
    await supabase
      .from("subscriptions")
      .update({
        trial_ends_at: newTrialEnd.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscription.id);

    await logEvent({
      accountId: id,
      eventType: "trial_extended",
      metadata: {
        previousEnd: subscription.trial_ends_at,
        newEnd: newTrialEnd.toISOString(),
        daysAdded: body.days,
        supportCaseId: body.supportCaseId,
        initiatedBy: "admin",
      },
      source: "api",
    });

    return NextResponse.json({
      success: true,
      trial: {
        previousEnd: subscription.trial_ends_at,
        newEnd: newTrialEnd.toISOString(),
        status: subscription.trial_type,
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
    console.error(`[API] PUT /api/account/${id}/trial:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
