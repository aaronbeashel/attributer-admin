import { NextResponse } from "next/server";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { getAccountWithSubscription } from "@/lib/account-helpers";
import { getStripeServer, createRefund } from "@/lib/stripe";
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

    if (!body.chargeId) {
      return NextResponse.json({ error: "chargeId is required" }, { status: 400 });
    }

    const result = await getAccountWithSubscription(id);
    if (!result) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Pre-flight: check charge status
    const stripe = getStripeServer();
    const charge = await stripe.charges.retrieve(body.chargeId);

    if (charge.refunded) {
      return NextResponse.json(
        { error: "Charge already fully refunded", chargeId: body.chargeId },
        { status: 409 }
      );
    }

    if (body.amount && body.amount > charge.amount - charge.amount_refunded) {
      return NextResponse.json(
        { error: "Refund amount exceeds refundable balance", refundable: charge.amount - charge.amount_refunded },
        { status: 400 }
      );
    }

    const refund = await createRefund({
      chargeId: body.chargeId,
      amount: body.amount,
      reason: "requested_by_customer",
      metadata: {
        accountId: id,
        adminReason: body.reason || "",
        supportCaseId: body.supportCaseId || "",
      },
    });

    await logEvent({
      accountId: id,
      eventType: "refund_issued",
      metadata: {
        chargeId: body.chargeId,
        refundId: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        reason: body.reason,
        supportCaseId: body.supportCaseId,
        isPartial: !!body.amount,
        initiatedBy: "admin",
      },
      source: "api",
    });

    return NextResponse.json({
      success: true,
      refund: {
        id: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status,
        chargeId: body.chargeId,
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
    console.error(`[API] POST /api/account/${id}/refund:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
