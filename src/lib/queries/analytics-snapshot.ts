import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface SnapshotMetric {
  label: string;
  current: number;
  previous: number;
  format: "currency" | "number" | "percent";
}

export async function getSnapshotMetrics(): Promise<SnapshotMetric[]> {
  const supabase = createSupabaseAdminClient();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

  // 1. MRR
  const { data: activeSubs } = await supabase
    .from("subscriptions")
    .select("plan_price_cents")
    .in("status", ["active", "trialing"]);
  const mrr = (activeSubs ?? []).reduce((sum, s) => sum + (s.plan_price_cents || 0), 0);

  const { data: prevSubs } = await supabase
    .from("subscriptions")
    .select("plan_price_cents, created_at")
    .in("status", ["active", "trialing"])
    .lte("created_at", endOfPrevMonth);
  const mrrPrev = (prevSubs ?? []).reduce((sum, s) => sum + (s.plan_price_cents || 0), 0);

  // 2. Total active customers
  const { count: activeCount } = await supabase
    .from("subscriptions")
    .select("*", { count: "exact", head: true })
    .in("status", ["active", "trialing"]);

  const { count: activePrevCount } = await supabase
    .from("subscriptions")
    .select("*", { count: "exact", head: true })
    .in("status", ["active", "trialing"])
    .lte("created_at", endOfPrevMonth);

  // 3. Signups this month
  const { count: signupsCount } = await supabase
    .from("accounts")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startOfMonth);

  const { count: signupsPrevCount } = await supabase
    .from("accounts")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startOfPrevMonth)
    .lte("created_at", endOfPrevMonth);

  // 4. Cancellations this month
  const { count: churnCount } = await supabase
    .from("accounts")
    .select("*", { count: "exact", head: true })
    .gte("cancelled_at", startOfMonth);

  const { count: churnPrevCount } = await supabase
    .from("accounts")
    .select("*", { count: "exact", head: true })
    .gte("cancelled_at", startOfPrevMonth)
    .lte("cancelled_at", endOfPrevMonth);

  // 5. Trial starts
  const { count: trialCount } = await supabase
    .from("accounts")
    .select("*", { count: "exact", head: true })
    .gte("trial_started_at", startOfMonth);

  const { count: trialPrevCount } = await supabase
    .from("accounts")
    .select("*", { count: "exact", head: true })
    .gte("trial_started_at", startOfPrevMonth)
    .lte("trial_started_at", endOfPrevMonth);

  // 6. Trial conversions
  const { count: conversionCount } = await supabase
    .from("accounts")
    .select("*", { count: "exact", head: true })
    .gte("trial_converted_at", startOfMonth);

  const { count: conversionPrevCount } = await supabase
    .from("accounts")
    .select("*", { count: "exact", head: true })
    .gte("trial_converted_at", startOfPrevMonth)
    .lte("trial_converted_at", endOfPrevMonth);

  // 7. Conversion rate
  const convRate = trialCount && trialCount > 0 ? ((conversionCount ?? 0) / trialCount) * 100 : 0;
  const convRatePrev = trialPrevCount && trialPrevCount > 0 ? ((conversionPrevCount ?? 0) / trialPrevCount) * 100 : 0;

  // 8. Total accounts
  const { count: totalAccounts } = await supabase
    .from("accounts")
    .select("*", { count: "exact", head: true });

  const { count: totalAccountsPrev } = await supabase
    .from("accounts")
    .select("*", { count: "exact", head: true })
    .lte("created_at", endOfPrevMonth);

  // 9. Average MRR per customer
  const avgMrr = activeCount && activeCount > 0 ? mrr / activeCount : 0;
  const avgMrrPrev = activePrevCount && activePrevCount > 0 ? mrrPrev / activePrevCount : 0;

  return [
    { label: "MRR", current: mrr, previous: mrrPrev, format: "currency" },
    { label: "Active Customers", current: activeCount ?? 0, previous: activePrevCount ?? 0, format: "number" },
    { label: "Signups", current: signupsCount ?? 0, previous: signupsPrevCount ?? 0, format: "number" },
    { label: "Cancellations", current: churnCount ?? 0, previous: churnPrevCount ?? 0, format: "number" },
    { label: "Trial Starts", current: trialCount ?? 0, previous: trialPrevCount ?? 0, format: "number" },
    { label: "Trial Conversions", current: conversionCount ?? 0, previous: conversionPrevCount ?? 0, format: "number" },
    { label: "Conversion Rate", current: convRate, previous: convRatePrev, format: "percent" },
    { label: "Total Accounts", current: totalAccounts ?? 0, previous: totalAccountsPrev ?? 0, format: "number" },
    { label: "Avg MRR/Customer", current: avgMrr, previous: avgMrrPrev, format: "currency" },
  ];
}
