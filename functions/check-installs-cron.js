// Railway cron function — processes pending install checks every 30 minutes
export default async function handler() {
  const adminUrl = process.env.ADMIN_APP_URL || "https://attributer-admin-staging-staging.up.railway.app";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET not set");
    return { error: "CRON_SECRET not configured" };
  }

  const res = await fetch(`${adminUrl}/api/cron/check-installs`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
    signal: AbortSignal.timeout(55000), // 55s timeout — batch of 10 takes ~25s
  });

  const data = await res.json();
  console.log("Check-installs cron result:", data);
  return data;
}
