// Railway cron function — calls the admin app's enrichment cron endpoint every 2 hours
console.log("[enrich-cron] starting");

const adminUrl = process.env.ADMIN_APP_URL || "https://attributer-admin-staging-staging.up.railway.app";
const cronSecret = process.env.CRON_SECRET;

if (!cronSecret) {
  console.error("[enrich-cron] CRON_SECRET not set");
  process.exit(1);
}

try {
  const res = await fetch(`${adminUrl}/api/cron/enrich`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const data = await res.json();
  console.log("[enrich-cron] result:", data);
} catch (err) {
  console.error("[enrich-cron] script threw:", err);
  process.exit(1);
}
