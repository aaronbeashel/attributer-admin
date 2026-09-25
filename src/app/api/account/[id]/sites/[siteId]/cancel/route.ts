import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { blockDomain, LICENSING_WRITES_DISABLED_MESSAGE } from "@/lib/external/blocklist";
import { logEvent } from "@/lib/event-logger";
import { checkBlockAllowed } from "@/lib/licensing/block-guard";

/**
 * Cancel a single site within a (multisite) account.
 *
 * Mirrors what happens when a customer cancels a site from their own account UI:
 *   1. The site is soft-deleted (status -> "inactive"); the row is kept for records.
 *   2. A "site_removed" event is written to the activity log.
 *   3. The site's domain is blocked in the licensing system so the script stops firing,
 *      unless the block guard refuses (the account's only active site, or another paying
 *      customer on the same root domain). The site cancel stands either way.
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

  // 2. Log the cancellation (same event type the customer flow uses)
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

  // 3. Block the domain in the licensing system (same as the customer self-cancel),
  //    only if the guard allows it, and keep the admin-side licensing tracking
  //    consistent with the Block button. The site is already inactive, so it can't
  //    protect itself, but the account's other active sites on the same root still do.
  let domainBlocked = false;
  let blockSkippedReason: string | undefined;

  if (site.domain) {
    const guard = await checkBlockAllowed(supabase, site.domain, {});
    if (!guard.ok) {
      blockSkippedReason = guard.error;
    } else {
      const result = await blockDomain(guard.domain, "Site cancelled");
      if (!result.success) {
        blockSkippedReason = result.reason === "disabled"
          ? LICENSING_WRITES_DISABLED_MESSAGE
          : "Not blocked. The licensing server didn't accept the block. Try again.";
      } else {
        domainBlocked = true;

        await supabase.from("licensing_domains").upsert(
          {
            domain: guard.domain,
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
            domain: guard.domain,
            action: "blocked",
            reason: "Site cancelled by admin",
            notes: feedback,
            actioned_by: "admin",
          });
        } catch {
          // Ignore if the audit table doesn't exist
        }
      }
    }
  }

  return NextResponse.json({ success: true, domainBlocked, ...(blockSkippedReason ? { blockSkippedReason } : {}) });
}
