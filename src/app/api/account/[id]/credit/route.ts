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

    if (!body.amount || body.amount <= 0) {
      return NextResponse.json({ error: "amount is required (positive integer in cents)" }, { status: 400 });
    }

    const result = await getAccountWithSubscription(id);
    if (!result?.subscription?.stripe_customer_id) {
      return NextResponse.json({ error: "No Stripe customer" }, { status: 404 });
    }

    const stripe = getStripeServer();

    // Negative amount = credit (reduces next invoice)
    const transaction = await stripe.customers.createBalanceTransaction(
      result.subscription.stripe_customer_id,
      {
        amount: -Math.abs(body.amount),
        currency: "usd",
        description: body.reason || "Account credit applied by support",
      }
    );

    // Get updated balance
    const customer = await stripe.customers.retrieve(result.subscription.stripe_customer_id);
    const currentBalance = (customer as Stripe.Customer).balance;

    await logEvent({
      accountId: id,
      eventType: "credit_applied",
      metadata: {
        amount: body.amount,
        transactionId: transaction.id,
        newBalance: currentBalance,
        reason: body.reason,
        supportCaseId: body.supportCaseId,
        initiatedBy: "admin",
      },
      source: "api",
    });

    return NextResponse.json({
      success: true,
      credit: {
        amount: body.amount,
        transactionId: transaction.id,
        newBalanceCents: currentBalance,
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
    console.error(`[API] POST /api/account/${id}/credit:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
