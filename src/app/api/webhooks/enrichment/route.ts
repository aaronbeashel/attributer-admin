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
    const {
      external_id, status, job_id,
      industry, sub_industry, company_size, signup_path,
      job_title, job_description,
      confidence_industry, confidence_size, confidence_path,
    } = body;

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

    // Upsert into account_enrichment table
    const { error: upsertError } = await supabase
      .from("account_enrichment")
      .upsert(
        {
          account_id: external_id,
          industry: industry ?? "Unknown",
          sub_industry: sub_industry ?? null,
          company_size: company_size ?? "Unknown",
          signup_path: signup_path ?? "Unknown",
          job_title: job_title ?? null,
          job_description: job_description ?? null,
          confidence_industry: confidence_industry ?? 0,
          confidence_size: confidence_size ?? 0,
          confidence_path: confidence_path ?? 0,
          enriched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id" }
      );

    if (upsertError) {
      console.error("[enrichment-webhook] Failed to upsert enrichment:", upsertError);
      return NextResponse.json({ error: "Failed to update enrichment" }, { status: 500 });
    }

    await logEvent({
      accountId: external_id,
      eventType: "account_classified",
      eventSubtype: status === "completed" ? "enrichment_completed" : "enrichment_failed",
      metadata: {
        jobId: job_id,
        status,
        industry,
        subIndustry: sub_industry,
        companySize: company_size,
        signupPath: signup_path,
        jobTitle: job_title,
        jobDescription: job_description,
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
