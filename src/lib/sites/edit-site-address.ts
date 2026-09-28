import type { SupabaseClient } from "@supabase/supabase-js";
import { checkBlockedDomainsStrict, unblockDomain } from "@/lib/external/blocklist";
import { isSharedHost, registrableRoot, rootFamily } from "@/lib/licensing/domain-match";
import { loadOwnersForDomain, type Owner, type OwnerSite } from "@/lib/licensing/entitlement";
import { normalizeDomain } from "@/lib/licensing/normalize";
import { recordUnblocked } from "@/lib/licensing/record-unblocked";
import { parseWebsiteAddress } from "@/lib/site-address";

// Admin correction of a site's website address (a typo fix). Saves the
// address, logs it, and unblocks the corrected domain when it's blocked and
// this account pays for an active site. It never blocks anything: not the old
// address, not the new one.

export type UnblockOutcome = "not_blocked" | "skipped" | "unblocked" | "failed" | "disabled" | "check_failed";

export interface SiteConflict {
  /** Their site related to the new domain. */
  domain: string;
  accountEmail: string | null;
  /** That site's status. */
  status: string;
  paying: boolean;
  latestStatus: string | null;
  /** Another site on the account being edited. */
  sameAccount: boolean;
}

export type EditSiteResult =
  | {
      kind: "saved";
      site: { id: string; domain: string; websiteUrl: string };
      unblock: UnblockOutcome;
      eventLogged: boolean;
      /** False only when an unblock happened and its licensing record or event didn't save. */
      unblockRecorded: boolean;
    }
  | { kind: "needs_confirmation"; message: string; conflicts: SiteConflict[] }
  | { kind: "refused"; status: 400 | 404 | 409; message: string }
  | { kind: "error"; status: 500 | 503; message: string };

export interface EditSiteInput {
  accountId: string;
  siteId: string;
  websiteUrl: string;
  /** The site's domain when the edit window opened. */
  expectedDomain: string | null;
  /** The domain the admin confirmed in the shared-root warning, if any. */
  confirmedDomain: string | null;
  /** The signed-in admin's email. */
  actor: string;
}

const READ_FAILED = "Not saved. We couldn't check the records, so nothing was changed. Try again.";
const STALE = "Not saved. This site's address changed since you opened it. Refresh and try again.";
const WEBFLOW = "Not saved. This site is connected through the Webflow Marketplace, so its address can't be changed here.";
const UNCHANGED = "Not saved. That's already this site's address.";
const UPDATE_FAILED = "Not saved. The database didn't accept the change. Try again.";

const LIVE_STATUSES = ["active", "suspended"];

function refused(status: 400 | 404 | 409, message: string): EditSiteResult {
  return { kind: "refused", status, message };
}

function readFailed(what: string, err: unknown): EditSiteResult {
  console.error(`[edit-site-address] Couldn't read ${what}:`, err);
  return { kind: "error", status: 503, message: READ_FAILED };
}

function who(owner: Owner): string {
  return owner.accountEmail ?? owner.accountName ?? owner.accountId;
}

function relatedSites(owner: Owner): OwnerSite[] {
  return [...owner.activeSites, ...owner.suspendedSites, ...owner.inactiveSites];
}

/**
 * The owner's related sites minus the site being edited. Owner sites carry no
 * id, so drop one entry with this site's current domain and status: if this
 * site is related it is one of those entries, and if it isn't, no entry can
 * have its domain.
 */
function relatedSitesOtherThan(owner: Owner, site: { domain: string | null; status: string }): OwnerSite[] {
  const sites = relatedSites(owner);
  const current = site.domain ? normalizeDomain(site.domain) : "";
  const index = sites.findIndex((s) => s.domain === current && s.status === site.status);
  if (index >= 0) sites.splice(index, 1);
  return sites;
}

export async function editSiteAddress(supabase: SupabaseClient, input: EditSiteInput): Promise<EditSiteResult> {
  const { accountId, siteId, expectedDomain, confirmedDomain, actor } = input;

  // 1. A real website address
  const parsed = parseWebsiteAddress(input.websiteUrl);
  if (!parsed.ok) return refused(400, `Not saved. ${parsed.error}`);
  const { websiteUrl, domain } = parsed;

  // 2. The site, scoped to the account
  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("id, account_id, domain, website_url, status")
    .eq("id", siteId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (siteError) return readFailed("the site", siteError);
  if (!site) return refused(404, "Site not found.");
  const oldDomain: string | null = site.domain ?? null;

  // 3. Nobody changed the address since the window opened
  if ((expectedDomain ?? null) !== oldDomain) return refused(409, STALE);

  // 4. Webflow Marketplace sites get their address from Webflow
  const { data: webflowRows, error: webflowError } = await supabase
    .from("site_integrations")
    .select("id")
    .eq("site_id", siteId)
    .eq("client_type", "webflow_app")
    .is("disconnected_at", null)
    .limit(1);
  if (webflowError) return readFailed("the site's integrations", webflowError);
  if ((webflowRows ?? []).length > 0) return refused(409, WEBFLOW);

  // 5. Something to change
  if (domain === oldDomain) return refused(400, UNCHANGED);

  // 6. Never a shared host
  if (isSharedHost(domain)) {
    return refused(409, `Not saved. ${domain} is a shared hosting address. Use the site's own domain.`);
  }

  // 7. Everyone with a site anywhere in the new domain's root family. This
  //    account is always loaded, so its paying status comes from the same rule.
  let owners: Owner[];
  try {
    owners = await loadOwnersForDomain(supabase, domain, "rootFamily", [accountId]);
  } catch (err) {
    return readFailed(`the owners of ${domain}`, err);
  }

  const key = normalizeDomain(domain); // how owner site domains are stored
  const own = owners.find((o) => o.accountId === accountId) ?? null;
  const others = owners.filter((o) => o.accountId !== accountId);
  const accountPaying = own?.accountPaying ?? false;

  // 7a. Another paying account already has this exact site. Paying here is our
  //     database's view only: an account Stripe bills but our records call
  //     non-paying gets the warning below, with its status, not this refusal.
  for (const owner of others) {
    if (!owner.accountPaying) continue;
    const exact = [...owner.activeSites, ...owner.suspendedSites].some((s) => s.domain === key);
    if (exact) return refused(409, `Not saved. ${domain} is already a site on a paying account (${who(owner)}).`);
  }

  // 7b. This account already has another live site on this exact domain
  const ownLive = own ? relatedSitesOtherThan(own, site).filter((s) => LIVE_STATUSES.includes(s.status)) : [];
  if (ownLive.some((s) => s.domain === key)) {
    return refused(409, `Not saved. This account already has a site on ${domain}.`);
  }

  // 7c. Anyone else on the root, and this account's other live sites under it
  //     (removing either later would block the root for both), need a confirmation
  //     for exactly this domain. Other accounts come first.
  const conflictOwners: Array<{ owner: Owner; site: OwnerSite; sameAccount: boolean }> = [
    ...others.map((owner) => ({ owner, site: relatedSites(owner)[0], sameAccount: false })),
    ...(own && ownLive.length > 0 ? [{ owner: own, site: ownLive[0], sameAccount: true }] : []),
  ].filter((c) => c.site !== undefined);

  const conflicts: SiteConflict[] = conflictOwners.map(({ owner, site: related, sameAccount }) => ({
    domain: related.domain,
    accountEmail: owner.accountEmail,
    status: related.status,
    paying: owner.accountPaying,
    latestStatus: owner.latestStatus,
    sameAccount,
  }));

  const willUnblock = site.status === "active" && accountPaying;
  const root = registrableRoot(domain);

  if (conflicts.length > 0 && confirmedDomain !== domain) {
    const first = conflictOwners[0];
    const lines = [
      `${root} is also used by ${who(first.owner)} (${first.site.status}). A block on one account can switch off the other, so check this is the right customer.`,
    ];
    // Only worth saying when this save would unblock it
    if (willUnblock) {
      const other = who((conflictOwners.find((c) => !c.sameAccount) ?? first).owner);
      const [check] = await checkBlockedDomainsStrict([domain]);
      if (check?.isBlocked === true) {
        lines.push(`${root} is blocked. Saving unblocks it for everyone on it, including ${other}.`);
      } else if (check?.isBlocked !== false) {
        lines.push(`We couldn't check whether ${root} is blocked. If it is, saving unblocks it for everyone on it, including ${other}.`);
      }
    }
    return { kind: "needs_confirmation", message: lines.join("\n"), conflicts };
  }

  // 8. Save, only if the address is still what the window opened with
  const now = new Date().toISOString();
  const update = supabase
    .from("sites")
    .update({ website_url: websiteUrl, domain, updated_at: now })
    .eq("id", siteId)
    .eq("account_id", accountId);
  const { data: updated, error: updateError } = await (expectedDomain === null
    ? update.is("domain", null)
    : update.eq("domain", expectedDomain)
  ).select("id, status");
  if (updateError) {
    console.error("[edit-site-address] Site update failed:", updateError);
    return { kind: "error", status: 500, message: UPDATE_FAILED };
  }
  const saved = (updated ?? [])[0] as { id: string; status: string } | undefined;
  if (!saved) return refused(409, STALE);

  // 9. Log it straight away. A failed log doesn't undo the save, but is reported.
  const { error: eventError } = await supabase.from("event_log").insert({
    account_id: accountId,
    event_type: "site_updated",
    event_subtype: null,
    metadata: {
      siteId,
      oldDomain,
      newDomain: domain,
      oldWebsiteUrl: site.website_url ?? null,
      newWebsiteUrl: websiteUrl,
      actor,
      reason: "address_correction",
      confirmedDomain,
      conflicts,
    },
    source: "admin_action",
  });
  if (eventError) console.error("[edit-site-address] Couldn't log site_updated:", eventError);

  // 10. Unblock the new domain once, when this account pays for this active site.
  //     The licensing server widens the check and the unblock to the root.
  let unblock: UnblockOutcome = "skipped";
  let unblockRecorded = true;
  if (saved.status === "active" && accountPaying) {
    unblock = await unblockIfBlocked(domain);
    if (unblock === "unblocked") {
      unblockRecorded = await recordTheUnblock(supabase, { accountId, siteId, domain, oldDomain, actor });
    }
  }

  return {
    kind: "saved",
    site: { id: siteId, domain, websiteUrl },
    unblock,
    eventLogged: !eventError,
    unblockRecorded,
  };
}

async function unblockIfBlocked(domain: string): Promise<UnblockOutcome> {
  let isBlocked: boolean | null;
  try {
    const [check] = await checkBlockedDomainsStrict([domain]);
    isBlocked = check?.isBlocked ?? null;
  } catch (err) {
    console.error(`[edit-site-address] Block check failed for ${domain}:`, err);
    isBlocked = null;
  }
  if (isBlocked === null) return "check_failed";
  if (!isBlocked) return "not_blocked";

  try {
    const result = await unblockDomain(domain);
    if (result.reason === "disabled") return "disabled";
    return result.success ? "unblocked" : "failed";
  } catch (err) {
    console.error(`[edit-site-address] Unblock failed for ${domain}:`, err);
    return "failed";
  }
}

/** The licensing rows for the root family and a domain_unblocked event. False if either didn't save. */
async function recordTheUnblock(
  supabase: SupabaseClient,
  args: { accountId: string; siteId: string; domain: string; oldDomain: string | null; actor: string }
): Promise<boolean> {
  const { accountId, siteId, domain, oldDomain, actor } = args;
  const root = registrableRoot(domain);
  let recorded = true;

  const note = oldDomain
    ? `Unblocked after correcting ${oldDomain} to ${domain}`
    : `Unblocked after setting the address to ${domain}`;
  try {
    await recordUnblocked(supabase, root, note, actor, { rowDomains: rootFamily(domain) });
  } catch (err) {
    console.error("[edit-site-address] Couldn't record the unblock:", err);
    recorded = false;
  }

  const { error } = await supabase.from("event_log").insert({
    account_id: accountId,
    event_type: "domain_unblocked",
    event_subtype: null,
    metadata: { domain, root, reason: "address_correction", siteId, actor },
    source: "admin_action",
  });
  if (error) {
    console.error("[edit-site-address] Couldn't log domain_unblocked:", error);
    recorded = false;
  }

  return recorded;
}
