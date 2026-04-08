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

export interface BatchCheckResponse {
  batch_id: string;
  total: number;
  status: string;
}

/** Submit a batch of domains for async checking via webhook callbacks */
export async function submitBatchCheck(
  domains: string[],
  webhookUrl: string,
  webhookSecret: string
): Promise<BatchCheckResponse> {
  const checkerUrl = process.env.ATTRIBUTER_CHECKER_URL;
  const apiKey = process.env.ATTRIBUTER_CHECKER_API_KEY;

  if (!checkerUrl || !apiKey) {
    throw new Error("Checker service not configured");
  }

  // ATTRIBUTER_CHECKER_URL points to /check — derive base URL for /check-batch
  const baseUrl = checkerUrl.replace(/\/check$/, "");

  const res = await fetch(`${baseUrl}/check-batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      urls: domains,
      webhook_url: webhookUrl,
      webhook_secret: webhookSecret,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Batch submit failed: HTTP ${res.status} - ${text}`);
  }

  return res.json();
}
