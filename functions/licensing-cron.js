// Railway cron function — fetches licensing CSV and runs pipeline every Monday
export default async function handler() {
  const adminUrl = process.env.ADMIN_APP_URL || "https://attributer-admin-staging-staging.up.railway.app";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET not set");
    return { error: "CRON_SECRET not configured" };
  }

  const res = await fetch(`${adminUrl}/api/cron/licensing`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  });

  const data = await res.json();
  console.log("Licensing cron result:", data);
  return data;
}
