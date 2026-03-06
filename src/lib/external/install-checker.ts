// Install Checker API — stubbed with mock responses until real API keys are provided

export interface InstallCheckResult {
  domain: string;
  scriptFound: boolean;
  scriptVersion?: string;
  lastCheckedAt: string;
}

export async function checkInstall(domain: string): Promise<InstallCheckResult> {
  console.warn("[InstallChecker] Stubbed: checkInstall", domain);
  return {
    domain,
    scriptFound: false,
    lastCheckedAt: new Date().toISOString(),
  };
}

export async function checkInstallBatch(domains: string[]): Promise<InstallCheckResult[]> {
  console.warn("[InstallChecker] Stubbed: checkInstallBatch", domains.length, "domains");
  return domains.map((domain) => ({
    domain,
    scriptFound: false,
    lastCheckedAt: new Date().toISOString(),
  }));
}
