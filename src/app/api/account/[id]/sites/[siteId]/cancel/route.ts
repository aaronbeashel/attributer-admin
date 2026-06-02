import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { blockDomain } from "@/lib/external/blocklist";
import { logEvent } from "@/lib/event-logger";

/**
 * Cancel a single site within a (multisite) account.
 *
 * Mirrors what happens when a customer cancels a site from their own account UI:
 *   1. The site is soft-deleted (status -> "inactive"); the row is kept for records.
 *   2. The site's domain is blocked in the licensing system so the script stops firing.
 *   3. A "site_removed" event is written to the activity log.
 *
 * Crucially, Stripe / billing is left untouched — multisite plans are flat-rate per
 * tier, not per-site, so cancelling one site never changes the subscription.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; siteId: string }> }
) {
  if (!verifyAdminApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: accountId, siteId } = await params;

  let body: { reason?: string; feedback?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const reason = body.reason?.trim() || "Other";
  const feedback = body.feedback?.trim() || null;

  const supabase = createSupabaseAdminClient();

  // Fetch the site, scoped to the account so we can't touch another account's site
  const { data: site, error: fetchError } = await supabase
    .from("sites")
    .select("id, name, domain, status")
    .eq("id", siteId)
    .eq("account_id", accountId)
    .single();

  if (fetchError || !site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  if (site.status === "inactive") {
    return NextResponse.json({ error: "Site is already cancelled" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // 1. Soft-delete: mark the site inactive (subscription/billing untouched)
  const { error: updateError } = await supabase
    .from("sites")
    .update({ status: "inactive", updated_at: now })
    .eq("id", siteId);

  if (updateError) {
    console.error("[cancel-site] Failed to update site status:", updateError);
    return NextResponse.json({ error: "Failed to cancel site" }, { status: 500 });
  }

  // 2. Block the domain in the licensing system (same as the customer self-cancel),
  //    and keep the admin-side licensing tracking consistent with the Block button.
  if (site.domain) {
    await blockDomain(site.domain, "Site cancelled");

    await supabase.from("licensing_domains").upsert(
      {
        domain: site.domain,
        status: "blocked",
        is_blocked: true,
        reviewed_at: now,
        reviewed_by: "admin",
        review_note: "Site cancelled by admin",
        updated_at: now,
      },
      { onConflict: "domain" }
    );

    try {
      await supabase.from("licensing_reviews").insert({
        domain: site.domain,
        action: "blocked",
        reason: "Site cancelled by admin",
        notes: feedback,
        actioned_by: "admin",
      });
    } catch {
      // Ignore if the audit table doesn't exist
    }
  }

  // 3. Log the cancellation (same event type the customer flow uses)
  await logEvent({
    accountId,
    eventType: "site_removed",
    metadata: {
      siteId,
      name: site.name,
      domain: site.domain,
      cancellationReason: reason,
      cancellationFeedback: feedback,
      cancelledBy: "admin",
    },
    source: "admin_action",
  });

  return NextResponse.json({ success: true });
}
