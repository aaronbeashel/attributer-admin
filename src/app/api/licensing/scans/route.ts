import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("licensing_scans")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return NextResponse.json({ scan: null });
  }

  return NextResponse.json({
    scan: {
      id: data.id,
      scanType: data.scan_type,
      totalRows: data.total_rows,
      uniqueDomains: data.unique_domains,
      unlicensedCount: data.unlicensed_count,
      results: typeof data.results === "string" ? JSON.parse(data.results) : data.results,
      createdAt: data.created_at,
    },
  });
}
