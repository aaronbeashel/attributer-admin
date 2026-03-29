import { NextResponse } from "next/server";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { getAccountWithSubscription } from "@/lib/account-helpers";
import { getDefaultPaymentMethod } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await getAccountWithSubscription(id);

  if (!result) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const { account, subscription } = result;
  const supabase = createSupabaseAdminClient();

  // Get active sites
  const { data: sites } = await supabase
    .from("sites")
    .select("id, name, domain, website_url")
    .eq("account_id", id)
    .eq("is_active", true);

  // Get owner profile (BetterAuth user)
  const { data: owner } = await supabase
    .from("user")
    .select("id, name, email")
    .eq("id", account.betterauth_user_id)
    .single();

  // Get payment method from Stripe if customer exists
  let paymentMethod = null;
  if (subscription?.stripe_customer_id) {
    paymentMethod = await getDefaultPaymentMethod(subscription.stripe_customer_id);
  }

  return NextResponse.json({
    account: {
      id: account.id,
      name: account.name,
      email: account.email,
      company: account.company,
      signupMethod: account.signup_method,
      createdAt: account.created_at,
      cancelledAt: account.cancelled_at,
    },
    owner: owner
      ? { name: owner.name, email: owner.email }
      : null,
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          planId: subscription.plan_id,
          planName: subscription.plan_name,
          planPriceCents: subscription.plan_price_cents,
          trialType: subscription.trial_type,
          trialEndsAt: subscription.trial_ends_at,
          siteLimit: subscription.site_limit,
          leadLimit: subscription.lead_limit,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end,
          delinquentSince: subscription.delinquent_since,
          stripeCustomerId: subscription.stripe_customer_id,
          stripeSubscriptionId: subscription.stripe_subscription_id,
        }
      : null,
    paymentMethod,
    sites: (sites ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      domain: s.domain,
      websiteUrl: s.website_url,
    })),
  });
}
