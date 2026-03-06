import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface AccountListItem {
  id: string;
  name: string;
  email: string;
  company: string | null;
  createdAt: string;
  cancelledAt: string | null;
  planName: string | null;
  planPriceCents: number | null;
  subscriptionStatus: string | null;
}

export interface AccountsListResult {
  accounts: AccountListItem[];
  totalCount: number;
}

export interface AccountsListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  planFilter?: string;
  statusFilter?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export async function getAccountsList(params: AccountsListParams = {}): Promise<AccountsListResult> {
  const {
    page = 1,
    pageSize = 25,
    search,
    planFilter,
    statusFilter,
    sortBy = "created_at",
    sortOrder = "desc",
  } = params;

  const supabase = createSupabaseAdminClient();
  const offset = (page - 1) * pageSize;

  // Build the query
  let query = supabase
    .from("accounts")
    .select("id, name, email, company, created_at, cancelled_at, subscriptions(plan_name, plan_price_cents, status)", {
      count: "exact",
    });

  // Apply search filter (email, name, or company)
  if (search) {
    query = query.or(
      `email.ilike.%${search}%,name.ilike.%${search}%,company.ilike.%${search}%`
    );
  }

  // Apply sorting
  const validSortColumns: Record<string, string> = {
    created_at: "created_at",
    name: "name",
    email: "email",
    company: "company",
  };

  const sortColumn = validSortColumns[sortBy] || "created_at";
  query = query.order(sortColumn, { ascending: sortOrder === "asc" });

  // Apply pagination
  query = query.range(offset, offset + pageSize - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error("Error fetching accounts:", error);
    return { accounts: [], totalCount: 0 };
  }

  let accounts: AccountListItem[] = (data ?? []).map((a) => {
    const sub = Array.isArray(a.subscriptions) ? a.subscriptions[0] : null;
    return {
      id: a.id,
      name: a.name,
      email: a.email,
      company: a.company,
      createdAt: a.created_at,
      cancelledAt: a.cancelled_at,
      planName: sub?.plan_name ?? null,
      planPriceCents: sub?.plan_price_cents ?? null,
      subscriptionStatus: sub?.status ?? null,
    };
  });

  // Client-side filtering for subscription fields (PostgREST can't filter on joined tables easily)
  if (planFilter) {
    accounts = accounts.filter((a) => a.planName?.toLowerCase() === planFilter.toLowerCase());
  }
  if (statusFilter) {
    accounts = accounts.filter((a) => a.subscriptionStatus?.toLowerCase() === statusFilter.toLowerCase());
  }

  return {
    accounts,
    totalCount: count ?? 0,
  };
}

export async function getDistinctPlans(): Promise<string[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("plan_name")
    .order("plan_name");

  const plans = new Set((data ?? []).map((s) => s.plan_name));
  return Array.from(plans).filter(Boolean) as string[];
}

export async function getDistinctStatuses(): Promise<string[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("status")
    .order("status");

  const statuses = new Set((data ?? []).map((s) => s.status));
  return Array.from(statuses).filter(Boolean) as string[];
}
