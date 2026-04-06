import { NextRequest, NextResponse } from "next/server";
import { parseCSV } from "@/lib/licensing/process-csv";
import { normalizeDomain, deduplicateDomains } from "@/lib/licensing/normalize";
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

    const normalized = rawRows.map((r) => ({
      domain: normalizeDomain(r.domain),
      callCount: r.callCount,
    }));
    const deduplicated = deduplicateDomains(normalized);

    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    // Upsert all domains into licensing_domains with status 'new'
    for (const d of deduplicated) {
      await supabase
        .from("licensing_domains")
        .upsert(
          {
            domain: d.domain,
            call_count: d.callCount,
            last_seen_at: now,
            updated_at: now,
          },
          { onConflict: "domain", ignoreDuplicates: false }
        );
    }

    return NextResponse.json({
      success: true,
      totalRows: rawRows.length,
      uniqueDomains: deduplicated.length,
      message: "Domains imported. Fast checks and install verification will run via cron.",
    });
  } catch (error) {
    console.error("Licensing processing error:", error);
    return NextResponse.json({ error: "Failed to process CSV" }, { status: 500 });
  }
}
