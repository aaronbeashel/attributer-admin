import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const supabase = createSupabaseAdminClient();
  const pattern = `%${query}%`;

  // Fan out across accounts, sites, and users — collect matching account_ids.
  const [accountMatches, siteMatches, userMatches] = await Promise.all([
    supabase
      .from("accounts")
      .select("id")
      .or(`email.ilike.${pattern},name.ilike.${pattern},company.ilike.${pattern}`)
      .limit(20),
    supabase
      .from("sites")
      .select("account_id")
      .or(`domain.ilike.${pattern},name.ilike.${pattern},website_url.ilike.${pattern}`)
      .limit(20),
    supabase
      .from("users")
      .select("account_id")
      .or(`email.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`)
      .limit(20),
  ]);

  const accountIds = new Set<string>();
  (accountMatches.data ?? []).forEach((r) => r.id && accountIds.add(r.id));
  (siteMatches.data ?? []).forEach((r) => r.account_id && accountIds.add(r.account_id));
  (userMatches.data ?? []).forEach((r) => r.account_id && accountIds.add(r.account_id));

  if (accountIds.size === 0) {
    return NextResponse.json({ results: [] });
  }

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, email, company, subscriptions(plan_name, status)")
    .in("id", Array.from(accountIds))
    .limit(8);

  const results = (accounts ?? []).map((a) => {
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
