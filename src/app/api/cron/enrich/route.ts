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

  // Find un-enriched accounts that have completed tool selection (site exists)
  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("id, email, company")
    .is("ai_enriched_at", null)
    .not("tools_selected_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(50);

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
      // Look up first active site for website_url
      const { data: sites } = await supabase
        .from("sites")
        .select("website_url")
        .eq("account_id", account.id)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1);

      const websiteUrl = sites?.[0]?.website_url ?? null;

      const res = await fetch(`${enrichmentUrl}/api/enrich`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${enrichmentKey}`,
        },
        body: JSON.stringify({
          email: account.email,
          company_name: account.company ?? null,
          website_url: websiteUrl,
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
