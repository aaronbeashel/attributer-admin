import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkBlockedDomains, type BlocklistCheckResult } from "@/lib/external/blocklist";
import { checkInstallBatch, type InstallCheckResult } from "@/lib/external/install-checker";

export interface PipelineResult {
  domain: string;
  callCount: number;
  isLicensed: boolean;
  isBlocked: boolean;
  scriptFound: boolean;
  priorReview: { action: string; actionedAt: string } | null;
  accountContext: { id: string; name: string; email: string } | null;
}

export async function filterLicensedDomains(
  domains: { domain: string; callCount: number }[]
): Promise<{ domain: string; callCount: number; isLicensed: boolean }[]> {
  const supabase = createSupabaseAdminClient();

  // Get all site domains from the database
  const { data: sites } = await supabase.from("sites").select("domain").not("domain", "is", null);
  const licensedDomains = new Set((sites ?? []).map((s) => s.domain?.toLowerCase()).filter(Boolean));

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

export async function checkInstalls(
  domains: string[]
): Promise<Map<string, InstallCheckResult>> {
  const results = await checkInstallBatch(domains);
  const map = new Map<string, InstallCheckResult>();
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

export async function runPipeline(
  domains: { domain: string; callCount: number }[]
): Promise<PipelineResult[]> {
  // Step 1: Filter licensed domains
  const withLicense = await filterLicensedDomains(domains);

  // Step 2: Get only unlicensed domains for further processing
  const unlicensed = withLicense.filter((d) => !d.isLicensed);
  const unlicensedDomains = unlicensed.map((d) => d.domain);

  // Step 3: Check blocklist
  const blockedMap = await filterBlockedDomains(unlicensedDomains);

  // Step 4: Check installs
  const installMap = await checkInstalls(unlicensedDomains);

  // Step 5: Get prior reviews
  const reviewMap = await getPriorReviews(unlicensedDomains);

  // Step 6: Get account context
  const contextMap = await getAccountContext(unlicensedDomains);

  // Build results (only unlicensed domains)
  return unlicensed.map((d) => ({
    domain: d.domain,
    callCount: d.callCount,
    isLicensed: false,
    isBlocked: blockedMap.get(d.domain)?.isBlocked ?? false,
    scriptFound: installMap.get(d.domain)?.scriptFound ?? false,
    priorReview: reviewMap.get(d.domain) ?? null,
    accountContext: contextMap.get(d.domain) ?? null,
  }));
}
