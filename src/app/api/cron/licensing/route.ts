import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseCSV } from "@/lib/licensing/process-csv";
import { normalizeDomain, deduplicateDomains } from "@/lib/licensing/normalize";
import { runPipeline } from "@/lib/licensing/pipeline";

export async function GET(request: Request) {
  // Validate cron secret
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serverUrl = process.env.LICENSING_SERVER_URL || "https://licenses.attributer.io";
  const username = process.env.LICENSING_SERVER_USERNAME || "attributer";
  const password = process.env.LICENSING_SERVER_PASSWORD || "";

  try {
    // Fetch CSV from licensing server
    const csvRes = await fetch(`${serverUrl}/report.csv`, {
      headers: {
        Authorization: "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!csvRes.ok) {
      console.error(`[cron/licensing] Failed to fetch CSV: HTTP ${csvRes.status}`);
      return NextResponse.json({ error: `Failed to fetch CSV: HTTP ${csvRes.status}` }, { status: 502 });
    }

    const csvText = await csvRes.text();
    if (!csvText.trim()) {
      return NextResponse.json({ success: true, message: "CSV was empty", totalRows: 0 });
    }

    // Parse and process (same flow as manual upload)
    const rawRows = parseCSV(csvText);
    if (rawRows.length === 0) {
      return NextResponse.json({ success: true, message: "No valid rows in CSV", totalRows: 0 });
    }

    const totalRows = rawRows.length;

    const normalized = rawRows.map((row) => ({
      ...row,
      domain: normalizeDomain(row.domain),
    }));

    const deduplicated = deduplicateDomains(normalized);
    const uniqueDomains = deduplicated.length;

    // Run through the full pipeline
    const results = await runPipeline(deduplicated);
    const unlicensedCount = results.length;

    // Store results in licensing_scans table
    const supabase = createSupabaseAdminClient();
    const { error: insertError } = await supabase.from("licensing_scans").insert({
      scan_type: "automated",
      total_rows: totalRows,
      unique_domains: uniqueDomains,
      unlicensed_count: unlicensedCount,
      results: JSON.stringify(results),
    });

    if (insertError) {
      console.error("[cron/licensing] Failed to store scan results:", insertError);
    }

    return NextResponse.json({
      success: true,
      scanType: "automated",
      totalRows,
      uniqueDomains,
      unlicensedCount,
    });
  } catch (err) {
    console.error("[cron/licensing] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
