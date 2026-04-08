import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  // Validate cron secret
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const enrichmentUrl = process.env.ENRICHMENT_SERVICE_URL;
  const enrichmentKey = process.env.ENRICHMENT_API_KEY;
  const adminAppUrl = process.env.ADMIN_APP_URL;

  if (!enrichmentUrl || !enrichmentKey || !adminAppUrl) {
    return NextResponse.json({ error: "Enrichment service not configured" }, { status: 500 });
  }

  const supabase = createSupabaseAdminClient();

  // Get accounts that need enrichment directly from the database
  // This uses a LEFT JOIN to find accounts without an enrichment row,
  // so it always returns genuinely unenriched accounts regardless of
  // how many have already been processed.
  const { data: accounts, error } = await supabase
    .rpc("get_unenriched_accounts", { batch_size: 50 });

  if (error) {
    console.error("[cron/enrich] Failed to query accounts:", error);
    return NextResponse.json({ error: "Failed to query accounts" }, { status: 500 });
  }

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ success: true, message: "No accounts to enrich", sent: 0 });
  }

  let sent = 0;
  let failed = 0;
  const webhookUrl = `${adminAppUrl}/api/webhooks/enrichment`;

  for (const account of accounts) {
    try {
      const res = await fetch(`${enrichmentUrl}/api/enrich`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${enrichmentKey}`,
        },
        body: JSON.stringify({
          email: account.email,
          company_name: account.company ?? null,
          website_url: account.website_url ?? null,
          person_name: account.person_name ?? null,
          webhook_url: webhookUrl,
          external_id: account.id,
        }),
      });

      if (res.ok) {
        sent++;
      } else {
        const errorText = await res.text();
        console.error(`[cron/enrich] Failed for ${account.id}:`, errorText);
        failed++;
      }
    } catch (err) {
      console.error(`[cron/enrich] Error for ${account.id}:`, err);
      failed++;
    }
  }

  return NextResponse.json({
    success: true,
    total: accounts.length,
    sent,
    failed,
  });
}
