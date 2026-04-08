export interface InstallCheckResult {
  domain: string;
  scriptFound: boolean;
  scriptVersion?: string;
  lastCheckedAt: string;
  indeterminate?: boolean;
  error?: string;
}

export async function checkInstall(domain: string): Promise<InstallCheckResult> {
  const checkerUrl = process.env.ATTRIBUTER_CHECKER_URL;
  const apiKey = process.env.ATTRIBUTER_CHECKER_API_KEY;

  if (!checkerUrl || !apiKey) {
    console.warn("[install-checker] Not configured, skipping check for", domain);
    return { domain, scriptFound: false, lastCheckedAt: new Date().toISOString(), indeterminate: true, error: "Checker not configured" };
  }

  try {
    const res = await fetch(checkerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ url: domain }),
      signal: AbortSignal.timeout(15000), // 15s — checker normally takes 6-10s, fail fast on slow ones
    });

    if (res.status === 429) {
      console.warn(`[install-checker] Rate limited checking ${domain}`);
      return { domain, scriptFound: false, lastCheckedAt: new Date().toISOString(), indeterminate: true, error: "Rate limited" };
    }

    if (!res.ok) {
      console.error(`[install-checker] HTTP ${res.status} checking ${domain}`);
      return { domain, scriptFound: false, lastCheckedAt: new Date().toISOString(), indeterminate: true, error: `HTTP ${res.status}` };
    }

    const data = await res.json();

    return {
      domain,
      // removed === false means script IS installed
      scriptFound: data.removed === false,
      lastCheckedAt: data.checkedAt || new Date().toISOString(),
      // removed === null means indeterminate
      indeterminate: data.removed === null,
      error: data.error ?? undefined,
    };
  } catch (err) {
    console.error(`[install-checker] Error checking ${domain}:`, err);
    return { domain, scriptFound: false, lastCheckedAt: new Date().toISOString(), indeterminate: true, error: "Request failed" };
  }
}

export async function checkInstallBatch(domains: string[]): Promise<InstallCheckResult[]> {
  // Run sequentially to respect 30 req/min rate limit
  const results: InstallCheckResult[] = [];

  for (const domain of domains) {
    const result = await checkInstall(domain);
    results.push(result);

    // Small delay between requests to stay under rate limit
    if (domains.indexOf(domain) < domains.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2100)); // ~28 req/min
    }
  }

  return results;
}
