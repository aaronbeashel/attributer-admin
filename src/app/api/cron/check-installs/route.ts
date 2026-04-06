import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkInstall } from "@/lib/external/install-checker";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  // Pick up 20 pending domains, highest call count first
  const { data: pending, error } = await supabase
    .from("licensing_domains")
    .select("id, domain")
    .eq("status", "pending_check")
    .order("call_count", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[cron/check-installs] Query error:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ success: true, checked: 0, remaining: 0, message: "No domains to check" });
  }

  let checked = 0;

  for (const domain of pending) {
    try {
      const result = await checkInstall(domain.domain);

      if (result.indeterminate) {
        await supabase.from("licensing_domains").update({
          status: "check_failed",
          script_installed: null,
          script_checked_at: now,
          updated_at: now,
        }).eq("id", domain.id);
      } else if (result.scriptFound) {
        await supabase.from("licensing_domains").update({
          status: "confirmed_unlicensed",
          script_installed: true,
          script_checked_at: now,
          updated_at: now,
        }).eq("id", domain.id);
      } else {
        await supabase.from("licensing_domains").update({
          status: "not_installed",
          script_installed: false,
          script_checked_at: now,
          updated_at: now,
        }).eq("id", domain.id);
      }

      checked++;
    } catch (err) {
      console.error(`[cron/check-installs] Error checking ${domain.domain}:`, err);
      await supabase.from("licensing_domains").update({
        status: "check_failed",
        script_checked_at: now,
        updated_at: now,
      }).eq("id", domain.id);
    }
  }

  // Get remaining count
  const { count: remaining } = await supabase
    .from("licensing_domains")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending_check");

  return NextResponse.json({
    success: true,
    checked,
    remaining: remaining ?? 0,
  });
}
