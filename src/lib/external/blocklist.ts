export interface BlocklistCheckResult {
  domain: string;
  isBlocked: boolean;
  blockedAt?: string;
  reason?: string;
}

export interface StrictBlocklistCheckResult {
  domain: string;
  /** null when the licensing server couldn't answer (HTTP error, timeout, unreadable body). */
  isBlocked: boolean | null;
  blockedAt?: string;
}

export interface LicensingWriteResult {
  success: boolean;
  /** "disabled" when LICENSING_SERVER_WRITES=disabled switched the write off. */
  reason?: "disabled";
}

function getAuthHeader(): string {
  const username = process.env.LICENSING_SERVER_USERNAME || "attributer";
  const password = process.env.LICENSING_SERVER_PASSWORD || "";
  return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
}

function getBaseUrl(): string {
  return process.env.LICENSING_SERVER_URL || "https://licenses.attributer.io";
}

export const LICENSING_WRITES_DISABLED_MESSAGE = "Licensing server writes are disabled in this environment.";

// Staging shares the production licensing server, so staging sets this to stop
// Block, Unblock and Cancel Site from changing it. Production never sets it.
function writesDisabled(action: string, domain: string): boolean {
  if (process.env.LICENSING_SERVER_WRITES !== "disabled") return false;
  console.warn(`[blocklist] LICENSING_SERVER_WRITES=disabled, not sending ${action} for ${domain}`);
  return true;
}

async function checkOne(baseUrl: string, auth: string, domain: string): Promise<StrictBlocklistCheckResult> {
  try {
    const res = await fetch(`${baseUrl}/blocked?site=${encodeURIComponent(domain)}`, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[blocklist] HTTP ${res.status} checking ${domain}`);
      return { domain, isBlocked: null };
    }

    const data = await res.json();

    // "Not found" response (HTTP 200) means domain was never in the block list
    if (data?.error === "Not found") {
      return { domain, isBlocked: false };
    }

    // isBlocked is an integer (1 or 0), not a boolean
    if (typeof data?.isBlocked !== "number") {
      console.warn(`[blocklist] Unexpected response checking ${domain}`);
      return { domain, isBlocked: null };
    }

    return {
      domain,
      isBlocked: data.isBlocked === 1,
      blockedAt: data.lastBlocked ?? undefined,
    };
  } catch (err) {
    console.error(`[blocklist] Error checking ${domain}:`, err);
    return { domain, isBlocked: null };
  }
}

/**
 * Ask the licensing server whether each domain is blocked, with at most
 * `concurrency` requests in flight. Fails closed: an unanswered check is null,
 * never "not blocked".
 */
export async function checkBlockedDomainsStrict(
  domains: string[],
  concurrency = 20
): Promise<StrictBlocklistCheckResult[]> {
  const baseUrl = getBaseUrl();
  const auth = getAuthHeader();
  const results: StrictBlocklistCheckResult[] = new Array(domains.length);
  let next = 0;

  async function worker() {
    while (next < domains.length) {
      const i = next++;
      results[i] = await checkOne(baseUrl, auth, domains[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), domains.length) }, worker));
  return results;
}

export async function checkBlockedDomains(domains: string[]): Promise<BlocklistCheckResult[]> {
  const results = await checkBlockedDomainsStrict(domains);
  // Fail-open for display callers: if we can't check, assume not blocked
  return results.map((r) => ({ domain: r.domain, isBlocked: r.isBlocked === true, blockedAt: r.blockedAt }));
}

export async function blockDomain(domain: string, _reason: string): Promise<LicensingWriteResult> {
  if (writesDisabled("block", domain)) return { success: false, reason: "disabled" };

  const baseUrl = getBaseUrl();
  const auth = getAuthHeader();

  try {
    const res = await fetch(`${baseUrl}/block`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify({ url: `https://${domain}` }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`[blocklist] Failed to block ${domain}: HTTP ${res.status}`);
      return { success: false };
    }

    return { success: true };
  } catch (err) {
    console.error(`[blocklist] Error blocking ${domain}:`, err);
    return { success: false };
  }
}

export async function unblockDomain(domain: string): Promise<LicensingWriteResult> {
  if (writesDisabled("unblock", domain)) return { success: false, reason: "disabled" };

  const baseUrl = getBaseUrl();
  const auth = getAuthHeader();

  try {
    const res = await fetch(`${baseUrl}/unblock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify({ url: `https://${domain}` }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`[blocklist] Failed to unblock ${domain}: HTTP ${res.status}`);
      return { success: false };
    }

    return { success: true };
  } catch (err) {
    console.error(`[blocklist] Error unblocking ${domain}:`, err);
    return { success: false };
  }
}
