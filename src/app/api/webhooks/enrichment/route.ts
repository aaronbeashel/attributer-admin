import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/event-logger";

export async function POST(request: Request) {
  // Validate enrichment API key
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== process.env.ENRICHMENT_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { external_id, status, industry, company_size, signup_path, confidence_industry, confidence_size, confidence_path, job_id } = body;

    if (!external_id) {
      return NextResponse.json({ error: "external_id is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Check account exists
    const { data: account, error: lookupError } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", external_id)
      .single();

    if (lookupError || !account) {
      console.warn(`[enrichment-webhook] Account not found: ${external_id}`);
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Update AI enrichment fields
    const { error: updateError } = await supabase
      .from("accounts")
      .update({
        ai_industry: industry ?? "Unknown",
        ai_company_size: company_size ?? "Unknown",
        ai_signup_path: signup_path ?? "Unknown",
        ai_confidence_industry: confidence_industry ?? 0,
        ai_confidence_size: confidence_size ?? 0,
        ai_confidence_path: confidence_path ?? 0,
        ai_enriched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", external_id);

    if (updateError) {
      console.error("[enrichment-webhook] Failed to update account:", updateError);
      return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
    }

    await logEvent({
      accountId: external_id,
      eventType: "account_classified",
      eventSubtype: status === "completed" ? "enrichment_completed" : "enrichment_failed",
      metadata: {
        jobId: job_id,
        status,
        industry,
        companySize: company_size,
        signupPath: signup_path,
        confidenceIndustry: confidence_industry,
        confidenceSize: confidence_size,
        confidencePath: confidence_path,
      },
      source: "system",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[enrichment-webhook] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
