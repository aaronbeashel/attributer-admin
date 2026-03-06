export function normalizeDomain(raw: string): string {
  let domain = raw.toLowerCase().trim();

  // Remove protocol
  domain = domain.replace(/^https?:\/\//, "");

  // Remove path
  domain = domain.split("/")[0];

  // Remove port
  domain = domain.split(":")[0];

  // Remove www
  domain = domain.replace(/^www\./, "");

  return domain;
}

export function deduplicateDomains(domains: { domain: string; callCount: number }[]): { domain: string; callCount: number }[] {
  const map = new Map<string, number>();

  for (const item of domains) {
    const normalized = normalizeDomain(item.domain);
    const existing = map.get(normalized) || 0;
    map.set(normalized, existing + item.callCount);
  }

  return Array.from(map.entries())
    .map(([domain, callCount]) => ({ domain, callCount }))
    .sort((a, b) => b.callCount - a.callCount);
}
