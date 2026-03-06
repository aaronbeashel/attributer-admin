import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const supabase = createSupabaseAdminClient();

  // First pass: exact ILIKE match
  const { data: exactMatches } = await supabase
    .from("accounts")
    .select("id, name, email, company, subscriptions(plan_name, status)")
    .or(`email.ilike.%${query}%,name.ilike.%${query}%,company.ilike.%${query}%`)
    .limit(8);

  const results = (exactMatches ?? []).map((a) => {
    const sub = Array.isArray(a.subscriptions) ? a.subscriptions[0] : null;
    return {
      id: a.id,
      name: a.name,
      email: a.email,
      company: a.company,
      planName: sub?.plan_name ?? null,
      status: sub?.status ?? null,
      matchType: "exact" as const,
    };
  });

  return NextResponse.json({ results });
}
