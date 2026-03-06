import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CARDLESS_CONVERSION_RATE } from "@/lib/utils/constants";

export interface PipelineMetrics {
  cardedTrials: number;
  cardlessTrials: number;
  estimatedCardlessConversions: number;
  totalPipeline: number;
}

export interface TrialAccount {
  id: string;
  name: string;
  email: string;
  company: string | null;
  planName: string;
  trialType: string | null;
  trialEndsAt: string | null;
  daysRemaining: number;
}

export async function getPipelineMetrics(): Promise<PipelineMetrics> {
  const supabase = createSupabaseAdminClient();

  const { data: trials } = await supabase
    .from("subscriptions")
    .select("trial_type, plan_price_cents")
    .eq("status", "trialing");

  let cardedTrials = 0;
  let cardlessTrials = 0;

  for (const t of trials ?? []) {
    if (t.trial_type === "carded") {
      cardedTrials++;
    } else {
      cardlessTrials++;
    }
  }

  const estimatedCardlessConversions = Math.round(cardlessTrials * CARDLESS_CONVERSION_RATE);
  const totalPipeline = cardedTrials + estimatedCardlessConversions;

  return {
    cardedTrials,
    cardlessTrials,
    estimatedCardlessConversions,
    totalPipeline,
  };
}

export async function getActiveTrials(): Promise<TrialAccount[]> {
  const supabase = createSupabaseAdminClient();

  const { data } = await supabase
    .from("subscriptions")
    .select("account_id, plan_name, trial_type, trial_ends_at, accounts(id, name, email, company)")
    .eq("status", "trialing")
    .order("trial_ends_at", { ascending: true });

  const now = new Date();

  return (data ?? []).map((s) => {
    const acct = s.accounts as unknown as { id: string; name: string; email: string; company: string | null } | null;
    const trialEnd = s.trial_ends_at ? new Date(s.trial_ends_at) : null;
    const daysRemaining = trialEnd
      ? Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      id: acct?.id ?? s.account_id,
      name: acct?.name ?? "",
      email: acct?.email ?? "",
      company: acct?.company ?? null,
      planName: s.plan_name,
      trialType: s.trial_type,
      trialEndsAt: s.trial_ends_at,
      daysRemaining,
    };
  });
}
