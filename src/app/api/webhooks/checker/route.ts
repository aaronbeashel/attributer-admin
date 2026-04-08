import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  // Validate webhook secret
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== process.env.CHECKER_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { domain, removed, error: checkError, checkedAt } = body;

    if (!domain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    // Determine status based on removed field
    let status: string;
    let scriptInstalled: boolean | null;
    let errorValue: string | null = null;

    if (removed === false) {
      // Script IS installed — confirmed unlicensed
      status = "confirmed_unlicensed";
      scriptInstalled = true;
    } else if (removed === true) {
      // Script NOT installed
      status = "not_installed";
      scriptInstalled = false;
    } else {
      // Indeterminate — could not check
      status = "check_failed";
      scriptInstalled = null;
      errorValue = checkError ?? "Unknown error";
    }

    // Update the domain record
    const { error: updateError } = await supabase
      .from("licensing_domains")
      .update({
        status,
        script_installed: scriptInstalled,
        script_checked_at: checkedAt ?? now,
        check_error: errorValue,
        updated_at: now,
      })
      .eq("domain", domain);

    if (updateError) {
      console.warn(`[webhooks/checker] Failed to update ${domain}:`, updateError);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[webhooks/checker] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
