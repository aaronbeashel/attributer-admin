import { NextResponse } from "next/server";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { getAccountWithSubscription } from "@/lib/account-helpers";
import { listCharges } from "@/lib/stripe";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await getAccountWithSubscription(id);

  if (!result?.subscription?.stripe_customer_id) {
    return NextResponse.json({ error: "No Stripe customer found" }, { status: 404 });
  }

  const charges = await listCharges(result.subscription.stripe_customer_id);

  return NextResponse.json({
    accountId: id,
    stripeCustomerId: result.subscription.stripe_customer_id,
    charges,
  });
}
