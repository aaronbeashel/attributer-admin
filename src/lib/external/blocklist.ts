// Blocklist API — stubbed with mock responses until real API keys are provided

export interface BlocklistCheckResult {
  domain: string;
  isBlocked: boolean;
  blockedAt?: string;
  reason?: string;
}

export async function checkBlockedDomains(domains: string[]): Promise<BlocklistCheckResult[]> {
  console.warn("[Blocklist] Stubbed: checkBlockedDomains", domains.length, "domains");
  // Return all domains as not blocked
  return domains.map((domain) => ({
    domain,
    isBlocked: false,
  }));
}

export async function blockDomain(domain: string, reason: string): Promise<{ success: boolean }> {
  console.warn("[Blocklist] Stubbed: blockDomain", domain, reason);
  return { success: true };
}

export async function unblockDomain(domain: string): Promise<{ success: boolean }> {
  console.warn("[Blocklist] Stubbed: unblockDomain", domain);
  return { success: true };
}
