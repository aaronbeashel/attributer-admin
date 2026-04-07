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
      // Company classification
      industry, sub_industry, company_size, signup_path,
      employee_count, company_description, company_linkedin_url,
      // Person information
      job_title_raw, job_role, seniority_level,
      person_description, person_location, person_linkedin_url,
      years_experience,
      // Signup analysis
      email_domain, domains_match,
      // Confidence scores
      confidence_industry, confidence_size, confidence_path, confidence_person,
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
          // Company classification
          industry: industry ?? "Unknown",
          sub_industry: sub_industry ?? null,
          company_size: company_size ?? "Unknown",
          signup_path: signup_path ?? "Unknown",
          employee_count: employee_count ?? null,
          company_description: company_description ?? null,
          company_linkedin_url: company_linkedin_url ?? null,
          // Person information
          job_title_raw: job_title_raw ?? null,
          job_role: job_role ?? null,
          seniority_level: seniority_level ?? null,
          person_description: person_description ?? null,
          person_location: person_location ?? null,
          person_linkedin_url: person_linkedin_url ?? null,
          years_experience: years_experience ?? null,
          // Signup analysis
          email_domain: email_domain ?? null,
          domains_match: domains_match ?? null,
          // Confidence scores
          confidence_industry: confidence_industry ?? 0,
          confidence_size: confidence_size ?? 0,
          confidence_path: confidence_path ?? 0,
          confidence_person: confidence_person ?? null,
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
        employeeCount: employee_count,
        companyDescription: company_description,
        companyLinkedinUrl: company_linkedin_url,
        jobTitleRaw: job_title_raw,
        jobRole: job_role,
        seniorityLevel: seniority_level,
        personDescription: person_description,
        personLocation: person_location,
        personLinkedinUrl: person_linkedin_url,
        yearsExperience: years_experience,
        emailDomain: email_domain,
        domainsMatch: domains_match,
        confidenceIndustry: confidence_industry,
        confidenceSize: confidence_size,
        confidencePath: confidence_path,
        confidencePerson: confidence_person,
      },
      source: "system",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[enrichment-webhook] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
