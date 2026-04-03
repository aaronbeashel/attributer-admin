import { NextRequest, NextResponse } from "next/server";
import { parseCSV } from "@/lib/licensing/process-csv";
import { normalizeDomain, deduplicateDomains } from "@/lib/licensing/normalize";
import { runPipeline } from "@/lib/licensing/pipeline";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const csvText = await file.text();
    const rawRows = parseCSV(csvText);

    if (rawRows.length === 0) {
      return NextResponse.json({ error: "No valid rows found in CSV" }, { status: 400 });
    }

    // Normalize and deduplicate
    const normalized = rawRows.map((r) => ({
      domain: normalizeDomain(r.domain),
      callCount: r.callCount,
    }));
    const deduplicated = deduplicateDomains(normalized);

    // Run full pipeline
    const results = await runPipeline(deduplicated);

    // Persist results
    const supabase = createSupabaseAdminClient();
    await supabase.from("licensing_scans").insert({
      scan_type: "manual",
      total_rows: rawRows.length,
      unique_domains: deduplicated.length,
      unlicensed_count: results.length,
      results: JSON.stringify(results),
    });

    return NextResponse.json({
      totalRows: rawRows.length,
      uniqueDomains: deduplicated.length,
      unlicensedResults: results.length,
      results,
    });
  } catch (error) {
    console.error("Licensing processing error:", error);
    return NextResponse.json(
      { error: "Failed to process CSV" },
      { status: 500 }
    );
  }
}
