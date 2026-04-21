// Railway cron function — fetches licensing CSV and runs pipeline every Monday
console.log("[licensing-cron] starting");

const adminUrl = process.env.ADMIN_APP_URL || "https://attributer-admin-staging-staging.up.railway.app";
const cronSecret = process.env.CRON_SECRET;

if (!cronSecret) {
  console.error("[licensing-cron] CRON_SECRET not set");
  process.exit(1);
}

try {
  const res = await fetch(`${adminUrl}/api/cron/licensing`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const data = await res.json();
  console.log("[licensing-cron] result:", data);
} catch (err) {
  console.error("[licensing-cron] script threw:", err);
  process.exit(1);
}
