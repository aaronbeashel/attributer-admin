import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { blockDomain, unblockDomain } from "@/lib/external/blocklist";

export async function POST(request: NextRequest) {
  try {
    const { domain, action, reason, notes } = await request.json();

    if (!domain || !action || !["blocked", "dismissed", "unblocked"].includes(action)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Call licensing server
    if (action === "blocked") {
      await blockDomain(domain, reason || "Unlicensed usage");
    } else if (action === "unblocked") {
      await unblockDomain(domain);
    }

    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    if (action === "unblocked") {
      // Update licensing_domains if it exists
      await supabase.from("licensing_domains").update({
        status: "pending_check",
        is_blocked: false,
        reviewed_at: now,
        reviewed_by: "admin",
        review_note: notes ?? null,
        updated_at: now,
      }).eq("domain", domain);
    } else {
      // Block or dismiss — upsert into licensing_domains
      await supabase.from("licensing_domains").upsert({
        domain,
        status: action === "blocked" ? "blocked" : "dismissed",
        is_blocked: action === "blocked",
        reviewed_at: now,
        reviewed_by: "admin",
        review_note: notes ?? reason ?? null,
        updated_at: now,
      }, { onConflict: "domain" });
    }

    // Also record in licensing_reviews for backward compatibility
    try {
      await supabase.from("licensing_reviews").insert({
        domain,
        action,
        reason,
        notes,
        actioned_by: "admin",
      });
    } catch {
      // Ignore if table doesn't exist
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Licensing action error:", error);
    return NextResponse.json({ error: "Failed to process action" }, { status: 500 });
  }
}
