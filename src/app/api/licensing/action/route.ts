import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { blockDomain, unblockDomain, LICENSING_WRITES_DISABLED_MESSAGE } from "@/lib/external/blocklist";
import { normalizeDomain } from "@/lib/licensing/normalize";
import { checkBlockAllowed } from "@/lib/licensing/block-guard";

export async function POST(request: NextRequest) {
  try {
    const { domain: rawDomain, action, reason, notes, excludeAccountId } = await request.json();

    if (!rawDomain || !action || !["blocked", "dismissed", "unblocked"].includes(action)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Normalise once: the guard, the licensing server and the database all get this value
    const domain = normalizeDomain(String(rawDomain));
    if (!domain) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Call licensing server
    if (action === "blocked") {
      // Never block a domain a paying customer owns. A refusal sends and writes nothing.
      const guard = await checkBlockAllowed(supabase, domain, {
        excludeAccountId: typeof excludeAccountId === "string" ? excludeAccountId : undefined,
      });
      if (!guard.ok) {
        return NextResponse.json({ error: guard.error }, { status: guard.status });
      }

      const result = await blockDomain(domain, reason || "Unlicensed usage");
      if (!result.success) {
        const error = result.reason === "disabled"
          ? LICENSING_WRITES_DISABLED_MESSAGE
          : "Not blocked. The licensing server didn't accept the block. Try again.";
        return NextResponse.json({ error }, { status: 502 });
      }
    } else if (action === "unblocked") {
      const result = await unblockDomain(domain);
      if (!result.success) {
        const error = result.reason === "disabled"
          ? LICENSING_WRITES_DISABLED_MESSAGE
          : "Not unblocked. The licensing server didn't accept the change. Try again.";
        return NextResponse.json({ error }, { status: 502 });
      }
    }

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
