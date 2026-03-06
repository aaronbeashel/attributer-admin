import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface DashboardMetrics {
  mrr: number;
  totalCustomers: number;
  signupsThisMonth: number;
  churnThisMonth: number;
  mrrPrevious: number;
  customersPrevious: number;
  signupsPrevious: number;
  churnPrevious: number;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const supabase = createSupabaseAdminClient();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

  // Active subscriptions for MRR
  const { data: activeSubs } = await supabase
    .from("subscriptions")
    .select("plan_price_cents")
    .in("status", ["active", "trialing"]);

  const mrr = (activeSubs ?? []).reduce((sum, s) => sum + (s.plan_price_cents || 0), 0);

  // Total customers (accounts with active/trialing subscription)
  const { count: totalCustomers } = await supabase
    .from("subscriptions")
    .select("*", { count: "exact", head: true })
    .in("status", ["active", "trialing"]);

  // Signups this month
  const { count: signupsThisMonth } = await supabase
    .from("accounts")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startOfMonth);

  // Churn this month (cancelled subscriptions)
  const { count: churnThisMonth } = await supabase
    .from("accounts")
    .select("*", { count: "exact", head: true })
    .gte("cancelled_at", startOfMonth);

  // Previous month metrics
  const { data: prevSubs } = await supabase
    .from("subscriptions")
    .select("plan_price_cents")
    .in("status", ["active", "trialing"])
    .lte("created_at", endOfPrevMonth);

  const mrrPrevious = (prevSubs ?? []).reduce((sum, s) => sum + (s.plan_price_cents || 0), 0);

  const { count: customersPrevious } = await supabase
    .from("subscriptions")
    .select("*", { count: "exact", head: true })
    .in("status", ["active", "trialing"])
    .lte("created_at", endOfPrevMonth);

  const { count: signupsPrevious } = await supabase
    .from("accounts")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startOfPrevMonth)
    .lte("created_at", endOfPrevMonth);

  const { count: churnPrevious } = await supabase
    .from("accounts")
    .select("*", { count: "exact", head: true })
    .gte("cancelled_at", startOfPrevMonth)
    .lte("cancelled_at", endOfPrevMonth);

  return {
    mrr,
    totalCustomers: totalCustomers ?? 0,
    signupsThisMonth: signupsThisMonth ?? 0,
    churnThisMonth: churnThisMonth ?? 0,
    mrrPrevious,
    customersPrevious: customersPrevious ?? 0,
    signupsPrevious: signupsPrevious ?? 0,
    churnPrevious: churnPrevious ?? 0,
  };
}

export interface RecentAccount {
  id: string;
  name: string;
  email: string;
  company: string | null;
  createdAt: string;
  planName?: string;
}

export async function getRecentSignups(limit = 10): Promise<RecentAccount[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("accounts")
    .select("id, name, email, company, created_at, subscriptions(plan_name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    company: a.company,
    createdAt: a.created_at,
    planName: Array.isArray(a.subscriptions) ? a.subscriptions[0]?.plan_name : undefined,
  }));
}

export async function getRecentCancellations(limit = 10): Promise<RecentAccount[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("accounts")
    .select("id, name, email, company, cancelled_at, subscriptions(plan_name, cancellation_reason)")
    .not("cancelled_at", "is", null)
    .order("cancelled_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    company: a.company,
    createdAt: a.cancelled_at ?? a.id, // using cancelled_at as the date
    planName: Array.isArray(a.subscriptions) ? a.subscriptions[0]?.plan_name : undefined,
  }));
}
