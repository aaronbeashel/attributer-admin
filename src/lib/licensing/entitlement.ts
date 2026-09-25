import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeDomain } from "@/lib/licensing/normalize";
import {
  domainSuffixes,
  isRelated,
  isSharedHost,
  registrableRoot,
  rootFamily,
} from "@/lib/licensing/domain-match";
import { loadAllRows } from "@/lib/licensing/load-all";

// The single source of truth for "is someone paying for this domain". The
// licensing cron, the checker webhook, the block guard and the review hints all
// call these functions. Do not add a second copy of the rule.

export const PAYING_SUB_STATUSES = ["active", "trialing", "past_due"] as const;

export interface SiteRow { id: string; account_id: string; domain: string | null; status: string }
export interface AccountRow { id: string; name: string | null; email: string | null; cancelled_at: string | null }
export interface SubRow {
  account_id: string;
  status: string;
  created_at: string;
  plan_name: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

function isPayingStatus(status: string | null | undefined): boolean {
  return (PAYING_SUB_STATUSES as readonly string[]).includes(status ?? "");
}

function timeOf(value: string): number {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? -Infinity : t;
}

/** Latest row by created_at. On a tie, a paying row wins (never hide a payer). */
export function latestSubscription(subs: SubRow[]): SubRow | null {
  let best: SubRow | null = null;
  let bestTime = -Infinity;
  for (const s of subs) {
    const t = timeOf(s.created_at);
    if (
      best === null ||
      t > bestTime ||
      (t === bestTime && isPayingStatus(s.status) && !isPayingStatus(best.status))
    ) {
      best = s;
      bestTime = t;
    }
  }
  return best;
}

/** Paying: latest subscription is active, trialing or past_due, and the account isn't cancelled. */
export function isPayingAccount(account: AccountRow, latest: SubRow | null): boolean {
  return latest !== null && isPayingStatus(latest.status) && account.cancelled_at == null;
}

export function isPayingSite(site: SiteRow, account: AccountRow | undefined, latest: SubRow | null): boolean {
  return site.status === "active" && account !== undefined && isPayingAccount(account, latest);
}

interface IndexedSite { id: string; accountId: string; domain: string; status: string }

export interface LicensingSnapshot {
  accounts: Map<string, AccountRow>;
  subsByAccount: Map<string, SubRow[]>;
  latestByAccount: Map<string, SubRow | null>;
  payingAccountIds: Set<string>;
  /** Active sites per account, including sites with no domain. */
  activeSiteCount: Map<string, number>;
  /** Sites with a domain, per account, in load order. */
  sitesByAccount: Map<string, IndexedSite[]>;
  /** Normalised site domain -> sites stored with exactly that domain. */
  byExact: Map<string, IndexedSite[]>;
  /** Domain -> sites at or under it (each site is indexed under its domain and every parent). */
  bySuffix: Map<string, IndexedSite[]>;
  /** Email domain (and its parents) -> paying account ids. */
  byEmailDomain: Map<string, string[]>;
  /** First label of the registrable root -> active sites of paying accounts. */
  byFirstLabel: Map<string, IndexedSite[]>;
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildSnapshot(sites: SiteRow[], accounts: AccountRow[], subs: SubRow[]): LicensingSnapshot {
  const accountMap = new Map<string, AccountRow>();
  for (const a of accounts) accountMap.set(a.id, a);

  const subsByAccount = new Map<string, SubRow[]>();
  for (const s of subs) pushTo(subsByAccount, s.account_id, s);

  const latestByAccount = new Map<string, SubRow | null>();
  const payingAccountIds = new Set<string>();
  for (const a of accounts) {
    const latest = latestSubscription(subsByAccount.get(a.id) ?? []);
    latestByAccount.set(a.id, latest);
    if (isPayingAccount(a, latest)) payingAccountIds.add(a.id);
  }

  const activeSiteCount = new Map<string, number>();
  const sitesByAccount = new Map<string, IndexedSite[]>();
  const byExact = new Map<string, IndexedSite[]>();
  const bySuffix = new Map<string, IndexedSite[]>();
  const byFirstLabel = new Map<string, IndexedSite[]>();

  for (const s of sites) {
    if (s.status === "active") {
      activeSiteCount.set(s.account_id, (activeSiteCount.get(s.account_id) ?? 0) + 1);
    }
    const domain = s.domain ? normalizeDomain(s.domain) : "";
    if (!domain) continue;

    const site: IndexedSite = { id: s.id, accountId: s.account_id, domain, status: s.status };
    pushTo(sitesByAccount, site.accountId, site);
    pushTo(byExact, domain, site);
    for (const key of [domain, ...domainSuffixes(domain)]) pushTo(bySuffix, key, site);

    if (site.status === "active" && payingAccountIds.has(site.accountId) && !isSharedHost(domain)) {
      pushTo(byFirstLabel, registrableRoot(domain).split(".")[0], site);
    }
  }

  const byEmailDomain = new Map<string, string[]>();
  for (const a of accounts) {
    if (!payingAccountIds.has(a.id) || !a.email?.includes("@")) continue;
    const emailDomain = normalizeDomain(a.email.split("@").pop() ?? "");
    if (!emailDomain) continue;
    for (const key of [emailDomain, ...domainSuffixes(emailDomain)]) pushTo(byEmailDomain, key, a.id);
  }

  return {
    accounts: accountMap,
    subsByAccount,
    latestByAccount,
    payingAccountIds,
    activeSiteCount,
    sitesByAccount,
    byExact,
    bySuffix,
    byEmailDomain,
    byFirstLabel,
  };
}

export async function loadSnapshot(supabase: SupabaseClient): Promise<LicensingSnapshot> {
  const [sites, accounts, subs] = await Promise.all([
    loadAllRows<SiteRow>(supabase, "sites", "id, account_id, domain, status"),
    loadAllRows<AccountRow>(supabase, "accounts", "id, name, email, cancelled_at"),
    loadAllRows<SubRow>(
      supabase,
      "subscriptions",
      "account_id, status, created_at, plan_name, stripe_customer_id, stripe_subscription_id"
    ),
  ]);
  return buildSnapshot(sites, accounts, subs);
}

// --- Owners ---

export interface OwnerSite { domain: string; status: string }
export interface Owner {
  accountId: string;
  accountName: string | null;
  accountEmail: string | null;
  accountPaying: boolean;
  activeSites: OwnerSite[];
  suspendedSites: OwnerSite[];
  inactiveSites: OwnerSite[];
  planName: string | null;
  latestStatus: string | null;
  latestStripeSubscriptionId: string | null;
  /** Distinct, from all of the account's subscription rows. */
  stripeCustomerIds: string[];
  /** Active sites on the whole account, any domain. */
  accountActiveSiteCount: number;
}

/** The first owner that pays and has an active related site. */
export function payingOwner(owners: Owner[]): Owner | null {
  return owners.find((o) => o.accountPaying && o.activeSites.length > 0) ?? null;
}

function buildOwner(snapshot: LicensingSnapshot, accountId: string, related: IndexedSite[]): Owner {
  const account = snapshot.accounts.get(accountId);
  const latest = snapshot.latestByAccount.get(accountId) ?? null;
  const subs = snapshot.subsByAccount.get(accountId) ?? [];
  const pick = (status: string) =>
    related.filter((s) => s.status === status).map((s) => ({ domain: s.domain, status: s.status }));

  return {
    accountId,
    accountName: account?.name ?? null,
    accountEmail: account?.email ?? null,
    accountPaying: snapshot.payingAccountIds.has(accountId),
    activeSites: pick("active"),
    suspendedSites: pick("suspended"),
    inactiveSites: pick("inactive"),
    planName: latest?.plan_name ?? null,
    latestStatus: latest?.status ?? null,
    latestStripeSubscriptionId: latest?.stripe_subscription_id ?? null,
    stripeCustomerIds: [...new Set(subs.map((s) => s.stripe_customer_id).filter((id): id is string => !!id))],
    accountActiveSiteCount: snapshot.activeSiteCount.get(accountId) ?? 0,
  };
}

function compareOwners(a: Owner, b: Owner): number {
  const rank = (o: Owner) => (o.accountPaying && o.activeSites.length > 0 ? 0 : 1);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (a.accountEmail !== b.accountEmail) {
    if (a.accountEmail === null) return 1;
    if (b.accountEmail === null) return -1;
    return a.accountEmail < b.accountEmail ? -1 : 1;
  }
  return a.accountId < b.accountId ? -1 : a.accountId > b.accountId ? 1 : 0;
}

function ownersFromSites(snapshot: LicensingSnapshot, sites: IndexedSite[]): Owner[] {
  const byAccount = new Map<string, IndexedSite[]>();
  for (const s of sites) pushTo(byAccount, s.accountId, s);
  return [...byAccount].map(([id, related]) => buildOwner(snapshot, id, related)).sort(compareOwners);
}

function relatedSites(snapshot: LicensingSnapshot, domain: string): IndexedSite[] {
  if (!domain) return [];
  const candidates = [...(snapshot.bySuffix.get(domain) ?? [])];
  for (const parent of domainSuffixes(domain)) candidates.push(...(snapshot.byExact.get(parent) ?? []));

  const seen = new Set<string>();
  const out: IndexedSite[] = [];
  for (const site of candidates) {
    if (seen.has(site.id) || !isRelated(domain, site.domain)) continue;
    seen.add(site.id);
    out.push(site);
  }
  return out;
}

/** Accounts with a site related to the domain, paying owners first. */
export function findOwners(snapshot: LicensingSnapshot, domain: string): Owner[] {
  return ownersFromSites(snapshot, relatedSites(snapshot, normalizeDomain(domain)));
}

/** Accounts with a site related to any member of the domain's root family (siblings included). */
export function findRootFamilyOwners(snapshot: LicensingSnapshot, domain: string): Owner[] {
  const seen = new Set<string>();
  const sites: IndexedSite[] = [];
  for (const member of rootFamily(domain)) {
    for (const site of relatedSites(snapshot, member)) {
      if (seen.has(site.id)) continue;
      seen.add(site.id);
      sites.push(site);
    }
  }
  return ownersFromSites(snapshot, sites);
}

const DOMAIN_PATTERN = /^[a-z0-9.-]+$/;
const QUERY_CAP = 1000;

async function cappedRows<T>(
  query: PromiseLike<{ data: unknown; error: { message?: string } | null }>,
  label: string
): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`Owner lookup failed on ${label}: ${error.message ?? String(error)}`);
  const rows = (data ?? []) as T[];
  if (rows.length >= QUERY_CAP) {
    throw new Error(`Owner lookup returned ${QUERY_CAP} ${label} rows, so the filter is wrong`);
  }
  return rows;
}

/**
 * Targeted version of loadSnapshot + findOwners for one domain, used where a
 * full snapshot is too slow (the checker webhook, the block guard). It loads
 * the sites that could relate to the domain, then those accounts' accounts,
 * subscriptions and all of their sites, and runs the same functions on them.
 * Accounts in extraAccountIds are loaded too, and returned as owners even when
 * they have no related site. Any query failure throws.
 */
export async function loadOwnersForDomain(
  supabase: SupabaseClient,
  domain: string,
  mode: "related" | "rootFamily",
  extraAccountIds: string[] = []
): Promise<Owner[]> {
  const d = normalizeDomain(domain);
  if (!d || !DOMAIN_PATTERN.test(d)) return [];

  const members = mode === "related" ? [d] : rootFamily(d);
  const exact = new Set<string>();
  const under = new Set<string>();
  for (const member of members) {
    exact.add(member);
    for (const parent of domainSuffixes(member)) exact.add(parent);
    under.add(member);
  }
  const filters = [
    ...[...exact].map((x) => `domain.ilike.${x}`),
    ...[...under].map((x) => `domain.ilike.*.${x}`),
  ];

  const matched =
    filters.length === 0
      ? []
      : await cappedRows<SiteRow>(
          supabase.from("sites").select("id, account_id, domain, status").or(filters.join(",")).limit(QUERY_CAP),
          "sites"
        );

  const extras = extraAccountIds.filter((id) => !!id);
  const accountIds = [...new Set([...matched.map((s) => s.account_id), ...extras])];
  if (accountIds.length === 0) return [];

  const [accounts, subs, sites] = await Promise.all([
    cappedRows<AccountRow>(
      supabase.from("accounts").select("id, name, email, cancelled_at").in("id", accountIds).limit(QUERY_CAP),
      "accounts"
    ),
    cappedRows<SubRow>(
      supabase
        .from("subscriptions")
        .select("account_id, status, created_at, plan_name, stripe_customer_id, stripe_subscription_id")
        .in("account_id", accountIds)
        .limit(QUERY_CAP),
      "subscriptions"
    ),
    cappedRows<SiteRow>(
      supabase.from("sites").select("id, account_id, domain, status").in("account_id", accountIds).limit(QUERY_CAP),
      "sites"
    ),
  ]);

  const snapshot = buildSnapshot(sites, accounts, subs);
  const owners = mode === "related" ? findOwners(snapshot, d) : findRootFamilyOwners(snapshot, d);

  for (const id of extras) {
    if (!owners.some((o) => o.accountId === id) && snapshot.accounts.has(id)) {
      owners.push(buildOwner(snapshot, id, []));
    }
  }
  return owners;
}

// --- Review hints ---

export type Hint =
  | { kind: "suspended_site"; accountId: string; accountEmail: string | null; siteDomain: string }
  | { kind: "no_active_sites"; accountId: string; accountEmail: string | null; siteDomain: string }
  | { kind: "removed_site"; accountId: string; accountEmail: string | null; siteDomain: string }
  | { kind: "other_domain"; accountId: string; accountEmail: string | null; siteDomain: string | null };

const MIN_FIRST_LABEL_LENGTH = 5;

function firstActiveSite(snapshot: LicensingSnapshot, accountId: string): string | null {
  return snapshot.sitesByAccount.get(accountId)?.find((s) => s.status === "active")?.domain ?? null;
}

/**
 * Why a listed domain might still belong to a paying customer. Only meaningful
 * for rows with no paying owner; returns null when there is one.
 */
export function reviewHint(snapshot: LicensingSnapshot, domain: string, linkedAccountId: string | null): Hint | null {
  const d = normalizeDomain(domain);
  if (!d || isSharedHost(d)) return null;

  const owners = findOwners(snapshot, d);
  if (payingOwner(owners)) return null;
  const paying = owners.filter((o) => o.accountPaying);

  for (const o of paying) {
    if (o.suspendedSites.length > 0) {
      return { kind: "suspended_site", accountId: o.accountId, accountEmail: o.accountEmail, siteDomain: o.suspendedSites[0].domain };
    }
  }
  for (const o of paying) {
    if (o.accountActiveSiteCount === 0) {
      const site = o.activeSites[0] ?? o.suspendedSites[0] ?? o.inactiveSites[0];
      if (site) {
        return { kind: "no_active_sites", accountId: o.accountId, accountEmail: o.accountEmail, siteDomain: site.domain };
      }
    }
  }
  for (const o of paying) {
    if (o.inactiveSites.length > 0 && o.accountActiveSiteCount > 0) {
      return { kind: "removed_site", accountId: o.accountId, accountEmail: o.accountEmail, siteDomain: o.inactiveSites[0].domain };
    }
  }

  // other_domain: a paying account with no related site that looks like it owns this domain.
  const ownerIds = new Set(owners.map((o) => o.accountId));
  const otherDomain = (accountId: string, siteDomain: string | null): Hint => ({
    kind: "other_domain",
    accountId,
    accountEmail: snapshot.accounts.get(accountId)?.email ?? null,
    siteDomain,
  });

  if (linkedAccountId && snapshot.payingAccountIds.has(linkedAccountId) && !ownerIds.has(linkedAccountId)) {
    return otherDomain(linkedAccountId, firstActiveSite(snapshot, linkedAccountId));
  }

  const emailMatch = (snapshot.byEmailDomain.get(d) ?? []).find((id) => !ownerIds.has(id));
  if (emailMatch) return otherDomain(emailMatch, firstActiveSite(snapshot, emailMatch));

  const root = registrableRoot(d);
  const label = root.split(".")[0];
  if (label.length >= MIN_FIRST_LABEL_LENGTH) {
    const site = (snapshot.byFirstLabel.get(label) ?? []).find(
      (s) => !ownerIds.has(s.accountId) && registrableRoot(s.domain) !== root
    );
    if (site) return otherDomain(site.accountId, site.domain);
  }

  return null;
}
