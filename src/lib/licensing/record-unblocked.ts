import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The database side of an unblock, once the licensing server has accepted it:
 * reset the licensing_domains row to pending_check and add a licensing_reviews
 * entry for `domain`. By default the row reset matches `domain` exactly; pass
 * `rowDomains` to reset every row in that list instead (rows are stored as
 * reported, so a root's traffic can sit on a subdomain row). Both writes are
 * always attempted, then this throws if either failed.
 */
export async function recordUnblocked(
  supabase: SupabaseClient,
  domain: string,
  note: string | null,
  actor: string,
  opts: { rowDomains?: string[]; reason?: string | null } = {}
): Promise<void> {
  const now = new Date().toISOString();

  const update = supabase.from("licensing_domains").update({
    status: "pending_check",
    is_blocked: false,
    reviewed_at: now,
    reviewed_by: actor,
    review_note: note,
    updated_at: now,
  });
  const { error: updateError } = await (opts.rowDomains
    ? update.in("domain", opts.rowDomains)
    : update.eq("domain", domain));

  const { error: reviewError } = await supabase.from("licensing_reviews").insert({
    domain,
    action: "unblocked",
    reason: opts.reason ?? null,
    notes: note,
    actioned_by: actor,
  });

  const failures = [
    updateError && `licensing_domains: ${updateError.message ?? String(updateError)}`,
    reviewError && `licensing_reviews: ${reviewError.message ?? String(reviewError)}`,
  ].filter(Boolean);
  if (failures.length > 0) {
    throw new Error(`Couldn't record the unblock of ${domain} (${failures.join("; ")})`);
  }
}
