import { NextResponse } from "next/server";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { getAccountWithSubscription } from "@/lib/account-helpers";
import { cancelSubscription } from "@/lib/stripe";
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
    const atPeriodEnd = body.atPeriodEnd ?? false;

    const result = await getAccountWithSubscription(id);
    if (!result?.subscription) {
      return NextResponse.json({ error: "No subscription found" }, { status: 404 });
    }

    const { subscription } = result;

    if (subscription.status === "cancelled") {
      return NextResponse.json(
        { error: "Account already cancelled", cancelledAt: result.account.cancelled_at },
        { status: 409 }
      );
    }

    if (!subscription.stripe_subscription_id) {
      return NextResponse.json({ error: "No Stripe subscription ID" }, { status: 400 });
    }

    // Cancel in Stripe
    await cancelSubscription(subscription.stripe_subscription_id, atPeriodEnd);

    const supabase = createSupabaseAdminClient();

    if (atPeriodEnd) {
      await supabase
        .from("subscriptions")
        .update({
          cancellation_reason: body.reason || "admin_cancelled",
          cancellation_feedback: body.feedback || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscription.id);
    } else {
      await supabase
        .from("subscriptions")
        .update({
          status: "cancelled",
          cancellation_reason: body.reason || "admin_cancelled",
          cancellation_feedback: body.feedback || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscription.id);

      await supabase
        .from("accounts")
        .update({
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    }

    await logEvent({
      accountId: id,
      eventType: "subscription_cancelled",
      eventSubtype: atPeriodEnd ? "at_period_end" : "immediate",
      metadata: {
        reason: body.reason,
        feedback: body.feedback,
        supportCaseId: body.supportCaseId,
        initiatedBy: "admin",
      },
      source: "api",
    });

    return NextResponse.json({
      success: true,
      status: atPeriodEnd ? "cancel_scheduled" : "cancelled",
      cancelledAt: atPeriodEnd ? subscription.current_period_end : new Date().toISOString(),
    });
  } catch (err) {
    const stripeError = err as Stripe.errors.StripeError;
    if (stripeError?.type) {
      return NextResponse.json(
        { error: stripeError.message, code: stripeError.code, type: stripeError.type },
        { status: 400 }
      );
    }
    console.error(`[API] PUT /api/account/${id}/status:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
