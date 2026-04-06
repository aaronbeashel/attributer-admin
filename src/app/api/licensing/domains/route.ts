import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const supabase = createSupabaseAdminClient();
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "confirmed_unlicensed";
  const search = url.searchParams.get("search");
  const minCalls = parseInt(url.searchParams.get("minCalls") || "0", 10);

  // Get domains by status
  let query = supabase
    .from("licensing_domains")
    .select("*")
    .eq("status", status)
    .gte("call_count", minCalls)
    .order("call_count", { ascending: false })
    .limit(200);

  if (search) {
    query = query.ilike("domain", `%${search}%`);
  }

  const { data: domains, error } = await query;

  if (error) {
    console.error("[licensing/domains] Query error:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  // Get status counts
  const statuses = ["confirmed_unlicensed", "pending_check", "blocked", "dismissed", "licensed", "not_installed", "check_failed"];
  const counts: Record<string, number> = {};

  for (const s of statuses) {
    const { count } = await supabase
      .from("licensing_domains")
      .select("*", { count: "exact", head: true })
      .eq("status", s);
    counts[s] = count ?? 0;
  }

  return NextResponse.json({
    domains: (domains ?? []).map((d) => ({
      id: d.id,
      domain: d.domain,
      callCount: d.call_count,
      lastSeenAt: d.last_seen_at,
      isLicensed: d.is_licensed,
      isBlocked: d.is_blocked,
      scriptInstalled: d.script_installed,
      scriptCheckedAt: d.script_checked_at,
      status: d.status,
      accountId: d.account_id,
      accountName: d.account_name,
      accountEmail: d.account_email,
      reviewNote: d.review_note,
      reviewedAt: d.reviewed_at,
      reviewedBy: d.reviewed_by,
      createdAt: d.created_at,
    })),
    counts,
  });
}
