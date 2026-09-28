import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeDomain } from "@/lib/licensing/normalize";
import { isSharedHost, isValidDomain, rootFamily } from "@/lib/licensing/domain-match";
import { loadOwnersForDomain, PAYING_SUB_STATUSES, type Owner } from "@/lib/licensing/entitlement";
import { getSubscriptionEndState, stripeShowsPaying } from "@/lib/stripe";

export type GuardResult = { ok: true; domain: string } | { ok: false; status: 400 | 409 | 503; error: string };

function refuse(status: 400 | 409 | 503, error: string): GuardResult {
  return { ok: false, status, error };
}

function who(owner: Owner): string {
  return owner.accountEmail ?? owner.accountName ?? owner.accountId;
}

/**
 * An excluded account (the one being cancelled) stops protecting its domains
 * only when it no longer pays: not DB paying, or its latest subscription is
 * ending or canceled in Stripe. Any Stripe error keeps the protection.
 */
async function exclusionAllowed(owner: Owner): Promise<boolean> {
  if (!owner.accountPaying) return true;
  if (!(PAYING_SUB_STATUSES as readonly string[]).includes(owner.latestStatus ?? "")) return false;
  if (!owner.latestStripeSubscriptionId) return false;
  try {
    const state = await getSubscriptionEndState(owner.latestStripeSubscriptionId);
    return state === "ending" || state === "canceled";
  } catch (err) {
    console.error(`[block-guard] Couldn't read subscription ${owner.latestStripeSubscriptionId}, keeping exclusion off:`, err);
    return false;
  }
}

/**
 * Decide whether blocking a domain is safe. The licensing server blocks the
 * whole registrable root, so every site related to the domain or any of its
 * parents (siblings included) is checked. Anything uncertain refuses.
 */
export async function checkBlockAllowed(
  supabase: SupabaseClient,
  rawDomain: string,
  opts: { excludeAccountId?: string } = {}
): Promise<GuardResult> {
  // 1. A real domain, not a bare public suffix
  const domain = normalizeDomain(rawDomain ?? "");
  if (!isValidDomain(domain) || rootFamily(domain).length === 0) {
    return refuse(400, "Not blocked. That isn't a valid domain.");
  }

  // 2. Never a shared host
  if (isSharedHost(domain)) {
    return refuse(409, `Not blocked. ${domain} is a shared hosting address used by many customers.`);
  }

  // 3. Everyone with a site anywhere in the root family, plus the account stored on this domain's row
  let owners: Owner[];
  try {
    const { data: row, error } = await supabase
      .from("licensing_domains")
      .select("account_id")
      .eq("domain", domain)
      .maybeSingle();
    if (error) throw error;
    const linkedAccountId: string | null = row?.account_id ?? null;
    owners = await loadOwnersForDomain(supabase, domain, "rootFamily", linkedAccountId ? [linkedAccountId] : []);
  } catch (err) {
    console.error(`[block-guard] Owner lookup failed for ${domain}:`, err);
    return refuse(503, `Not blocked. We couldn't check who owns ${domain}, so nothing was changed. Try again.`);
  }

  // 3a. Drop the excluded account only if it has really stopped paying
  if (opts.excludeAccountId) {
    const excluded = owners.find((o) => o.accountId === opts.excludeAccountId);
    if (excluded && (await exclusionAllowed(excluded))) {
      owners = owners.filter((o) => o !== excluded);
    }
  }

  // 4. Paying accounts in our database
  for (const owner of owners) {
    if (!owner.accountPaying) continue;
    if (owner.activeSites.length > 0) {
      const plan = owner.planName ? `, ${owner.planName}` : "";
      return refuse(409, `Not blocked. ${owner.activeSites[0].domain} belongs to a paying customer (${who(owner)}${plan}).`);
    }
    if (owner.suspendedSites.length > 0) {
      return refuse(
        409,
        `Not blocked. ${who(owner)} pays for Attributer but their site ${owner.suspendedSites[0].domain} is suspended. Fix the site before blocking.`
      );
    }
    if (owner.accountActiveSiteCount === 0) {
      return refuse(409, `Not blocked. ${who(owner)} pays for Attributer but has no active sites. Check the account before blocking.`);
    }
    // Otherwise only inactive sites here and active ones elsewhere: they removed this one.
  }

  // 5. Stripe, for accounts our database says don't pay (records drift)
  const unpaid = owners.filter((o) => !o.accountPaying);
  const customerIds = [...new Set(unpaid.flatMap((o) => o.stripeCustomerIds))];
  if (customerIds.length > 0) {
    let result;
    try {
      result = await stripeShowsPaying(customerIds);
    } catch (err) {
      console.error(`[block-guard] Stripe check failed for ${domain}:`, err);
      return refuse(503, "Not blocked. We couldn't confirm with Stripe, so nothing was changed. Try again.");
    }
    if (result.paying) {
      const owner = unpaid.find((o) => !!result.customerId && o.stripeCustomerIds.includes(result.customerId)) ?? unpaid[0];
      return refuse(409, `Not blocked. Stripe shows ${who(owner)} is still paying (${result.status}). Check their account first.`);
    }
  }

  return { ok: true, domain };
}
