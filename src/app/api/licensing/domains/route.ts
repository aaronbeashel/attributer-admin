import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { findOwners, payingOwner, reviewHint, type LicensingSnapshot } from "@/lib/licensing/entitlement";
import { getHintSnapshot } from "@/lib/licensing/snapshot-cache";

// Rows Scan Results lists, which get a hint when they may belong to a paying customer
const HINT_STATUSES = ["confirmed_unlicensed", "check_failed"];

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

  // The hints need to know who pays. If that can't load, fail the request so
  // Scan Results shows its load error rather than cards without their warnings.
  let hintSnapshot: LicensingSnapshot | null = null;
  if (HINT_STATUSES.includes(status)) {
    try {
      hintSnapshot = await getHintSnapshot(supabase);
    } catch (err) {
      console.error("[licensing/domains] Failed to load account data for hints:", err);
      return NextResponse.json({ error: "Failed to load account data" }, { status: 500 });
    }
  }

  // Customers who started paying since the last refresh are still stored as
  // unlicensed until the next run marks them licensed. Never list them.
  let rows = domains ?? [];
  if (hintSnapshot) {
    const snapshot = hintSnapshot;
    const before = rows.length;
    rows = rows.filter((d) => !HINT_STATUSES.includes(d.status) || !payingOwner(findOwners(snapshot, d.domain)));
    if (rows.length < before) {
      console.log(`[licensing/domains] Hid ${before - rows.length} ${status} rows that now have a paying owner`);
    }
  }

  // Get status counts
  const statuses = ["confirmed_unlicensed", "pending_check", "blocked", "dismissed", "licensed", "not_installed", "check_failed", "shared_host"];
  const counts: Record<string, number> = {};

  for (const s of statuses) {
    const { count } = await supabase
      .from("licensing_domains")
      .select("*", { count: "exact", head: true })
      .eq("status", s);
    counts[s] = count ?? 0;
  }

  return NextResponse.json({
    domains: rows.map((d) => ({
      id: d.id,
      domain: d.domain,
      callCount: d.call_count,
      lastSeenAt: d.last_seen_at,
      isLicensed: d.is_licensed,
      isBlocked: d.is_blocked,
      scriptInstalled: d.script_installed,
      scriptCheckedAt: d.script_checked_at,
      checkError: d.check_error,
      status: d.status,
      accountId: d.account_id,
      accountName: d.account_name,
      accountEmail: d.account_email,
      reviewNote: d.review_note,
      reviewedAt: d.reviewed_at,
      reviewedBy: d.reviewed_by,
      createdAt: d.created_at,
      hint: hintSnapshot && HINT_STATUSES.includes(d.status) ? reviewHint(hintSnapshot, d.domain, d.account_id) : null,
    })),
    counts,
  });
}
