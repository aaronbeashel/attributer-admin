import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface AccountWithSubscription {
  account: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    betterauth_user_id: string;
    signup_method: string;
    created_at: string;
    cancelled_at: string | null;
  };
  subscription: {
    id: string;
    account_id: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    plan_id: string;
    plan_name: string;
    plan_price_cents: number;
    plan_currency: string;
    status: string;
    trial_type: string | null;
    trial_ends_at: string | null;
    site_limit: number;
    lead_limit: number | null;
    current_period_start: string | null;
    current_period_end: string | null;
    delinquent_since: string | null;
    cancellation_reason: string | null;
    cancellation_feedback: string | null;
    created_at: string;
    updated_at: string;
  } | null;
}

export async function getAccountWithSubscription(
  accountId: string
): Promise<AccountWithSubscription | null> {
  const supabase = createSupabaseAdminClient();

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, name, email, company, betterauth_user_id, signup_method, created_at, cancelled_at")
    .eq("id", accountId)
    .single();

  if (accountError || !account) return null;

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1);

  return {
    account,
    subscription: subscriptions?.[0] ?? null,
  };
}
