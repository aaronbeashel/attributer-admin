import { NextResponse } from "next/server";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const enrichmentUrl = process.env.ENRICHMENT_SERVICE_URL;
  const enrichmentKey = process.env.ENRICHMENT_API_KEY;
  const adminAppUrl = process.env.ADMIN_APP_URL;

  if (!enrichmentUrl || !enrichmentKey || !adminAppUrl) {
    return NextResponse.json({ error: "Enrichment service not configured" }, { status: 500 });
  }

  const supabase = createSupabaseAdminClient();

  // Get account
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, name, email, company")
    .eq("id", id)
    .single();

  if (accountError || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Get first active site
  const { data: sites } = await supabase
    .from("sites")
    .select("website_url")
    .eq("account_id", id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);

  const websiteUrl = sites?.[0]?.website_url ?? null;

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
        website_url: websiteUrl,
        person_name: account.name ?? null,
        webhook_url: `${adminAppUrl}/api/webhooks/enrichment`,
        external_id: account.id,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[enrich] Enrichment service error:", errorText);
      return NextResponse.json({ error: "Enrichment service returned an error" }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({
      success: true,
      jobId: data.job_id,
      message: "Enrichment requested — results will arrive via webhook",
    });
  } catch (err) {
    console.error("[enrich] Failed to call enrichment service:", err);
    return NextResponse.json({ error: "Failed to reach enrichment service" }, { status: 502 });
  }
}
