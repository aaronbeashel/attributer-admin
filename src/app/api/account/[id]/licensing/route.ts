import { NextResponse } from "next/server";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkBlockedDomains } from "@/lib/external/blocklist";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  // Get all sites for this account
  const { data: sites, error } = await supabase
    .from("sites")
    .select("id, name, domain, status")
    .eq("account_id", id)
    .not("domain", "is", null);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch sites" }, { status: 500 });
  }

  if (!sites || sites.length === 0) {
    return NextResponse.json({ sites: [] });
  }

  // Check licensing server for each domain
  const domains = sites.map((s) => s.domain).filter(Boolean) as string[];
  const blockedResults = await checkBlockedDomains(domains);
  const blockedMap = new Map(blockedResults.map((r) => [r.domain, r]));

  return NextResponse.json({
    sites: sites.map((s) => {
      const blocked = blockedMap.get(s.domain);
      return {
        siteId: s.id,
        name: s.name,
        domain: s.domain,
        siteStatus: s.status,
        isBlocked: blocked?.isBlocked ?? false,
        blockedAt: blocked?.blockedAt ?? null,
      };
    }),
  });
}
