export interface BlocklistCheckResult {
  domain: string;
  isBlocked: boolean;
  blockedAt?: string;
  reason?: string;
}

function getAuthHeader(): string {
  const username = process.env.LICENSING_SERVER_USERNAME || "attributer";
  const password = process.env.LICENSING_SERVER_PASSWORD || "";
  return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
}

function getBaseUrl(): string {
  return process.env.LICENSING_SERVER_URL || "https://licenses.attributer.io";
}

export async function checkBlockedDomains(domains: string[]): Promise<BlocklistCheckResult[]> {
  const baseUrl = getBaseUrl();
  const auth = getAuthHeader();

  const results = await Promise.all(
    domains.map(async (domain): Promise<BlocklistCheckResult> => {
      try {
        const res = await fetch(`${baseUrl}/blocked?site=${encodeURIComponent(domain)}`, {
          headers: { Authorization: auth },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          console.warn(`[blocklist] HTTP ${res.status} checking ${domain}`);
          return { domain, isBlocked: false };
        }

        const data = await res.json();

        // "Not found" response (HTTP 200) means domain was never in the block list
        if (data.error === "Not found") {
          return { domain, isBlocked: false };
        }

        // isBlocked is an integer (1 or 0), not a boolean
        return {
          domain,
          isBlocked: data.isBlocked === 1,
          blockedAt: data.lastBlocked ?? undefined,
        };
      } catch (err) {
        console.error(`[blocklist] Error checking ${domain}:`, err);
        // Fail-open: if we can't check, assume not blocked
        return { domain, isBlocked: false };
      }
    })
  );

  return results;
}

export async function blockDomain(domain: string, _reason: string): Promise<{ success: boolean }> {
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

export async function unblockDomain(domain: string): Promise<{ success: boolean }> {
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
