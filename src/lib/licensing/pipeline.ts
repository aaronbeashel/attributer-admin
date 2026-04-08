import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkBlockedDomains, type BlocklistCheckResult } from "@/lib/external/blocklist";

export interface PipelineResult {
  domain: string;
  callCount: number;
  isLicensed: boolean;
  isBlocked: boolean;
  scriptFound: boolean;
  priorReview: { action: string; actionedAt: string } | null;
  accountContext: { id: string; name: string; email: string } | null;
}

/**
 * Check if domains are licensed — a domain is only licensed if it exists
 * in the sites table AND the account has an active or trialing subscription.
 */
export async function filterLicensedDomains(
  domains: { domain: string; callCount: number }[]
): Promise<{ domain: string; callCount: number; isLicensed: boolean }[]> {
  const supabase = createSupabaseAdminClient();

  // Get site domains with their account's subscription status
  const { data: sites } = await supabase
    .from("sites")
    .select("domain, accounts(id, subscriptions(status))")
    .not("domain", "is", null);

  const licensedDomains = new Set<string>();

  for (const site of sites ?? []) {
    if (!site.domain) continue;
    const account = site.accounts as unknown as {
      id: string;
      subscriptions: Array<{ status: string }>;
    } | null;

    if (!account) continue;

    // Check if any subscription is active or trialing
    const hasActiveSub = account.subscriptions?.some(
      (sub) => sub.status === "active" || sub.status === "trialing"
    );

    if (hasActiveSub) {
      licensedDomains.add(site.domain.toLowerCase());
    }
  }

  return domains.map((d) => ({
    ...d,
    isLicensed: licensedDomains.has(d.domain.toLowerCase()),
  }));
}

export async function filterBlockedDomains(
  domains: string[]
): Promise<Map<string, BlocklistCheckResult>> {
  const results = await checkBlockedDomains(domains);
  const map = new Map<string, BlocklistCheckResult>();
  for (const r of results) {
    map.set(r.domain, r);
  }
  return map;
}

export async function getPriorReviews(
  domains: string[]
): Promise<Map<string, { action: string; actionedAt: string }>> {
  const supabase = createSupabaseAdminClient();
  const map = new Map<string, { action: string; actionedAt: string }>();

  if (domains.length === 0) return map;

  const { data } = await supabase
    .from("licensing_reviews")
    .select("domain, action, actioned_at")
    .in("domain", domains)
    .order("actioned_at", { ascending: false });

  for (const r of data ?? []) {
    if (!map.has(r.domain)) {
      map.set(r.domain, { action: r.action, actionedAt: r.actioned_at });
    }
  }

  return map;
}

export async function getAccountContext(
  domains: string[]
): Promise<Map<string, { id: string; name: string; email: string }>> {
  const supabase = createSupabaseAdminClient();
  const map = new Map<string, { id: string; name: string; email: string }>();

  if (domains.length === 0) return map;

  const { data } = await supabase
    .from("sites")
    .select("domain, accounts(id, name, email)")
    .in("domain", domains);

  for (const site of data ?? []) {
    if (site.domain && site.accounts) {
      const acct = site.accounts as unknown as { id: string; name: string; email: string };
      map.set(site.domain, { id: acct.id, name: acct.name, email: acct.email });
    }
  }

  return map;
}

// Note: runPipeline was removed — the licensing cron handles the pipeline
// directly and uses the batch webhook system for install checking.
