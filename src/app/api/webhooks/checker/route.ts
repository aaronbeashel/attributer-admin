import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeDomain } from "@/lib/licensing/normalize";
import { isSharedHost } from "@/lib/licensing/domain-match";
import { loadOwnersForDomain, payingOwner, type Owner } from "@/lib/licensing/entitlement";

export async function POST(request: Request) {
  // Validate webhook secret
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== process.env.CHECKER_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { domain: rawDomain, removed, error: checkError, checkedAt } = body;

    if (!rawDomain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }

    // Normalize domain — the checker service returns "https://example.com" but we store "example.com"
    const domain = normalizeDomain(rawDomain);

    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    // Determine status based on removed field
    let status: string;
    let scriptInstalled: boolean | null;
    let errorValue: string | null = null;
    let licence: { is_licensed: boolean; account: Owner | null } | null = null;

    if (removed === false) {
      // Script IS installed. Check the licence before listing it, since the
      // customer may have started paying (or matched by root domain) since the
      // row was queued.
      scriptInstalled = true;
      if (isSharedHost(domain)) {
        status = "shared_host";
        licence = { is_licensed: false, account: null };
      } else {
        let owners: Owner[];
        try {
          owners = await loadOwnersForDomain(supabase, domain, "related");
        } catch (err) {
          // Nothing written; the checker retries
          console.error(`[webhooks/checker] Owner lookup failed for ${domain}:`, err);
          return NextResponse.json({ error: "Owner lookup failed" }, { status: 500 });
        }
        const paying = payingOwner(owners);
        if (paying) {
          status = "licensed";
          licence = { is_licensed: true, account: paying };
        } else {
          status = "confirmed_unlicensed";
          licence = { is_licensed: false, account: owners[0] ?? null };
        }
      }
    } else if (removed === true) {
      // Script NOT installed
      status = "not_installed";
      scriptInstalled = false;
    } else {
      // Indeterminate — could not check
      status = "check_failed";
      scriptInstalled = null;
      errorValue = checkError ?? "Unknown error";
    }

    const update: Record<string, unknown> = {
      status,
      script_installed: scriptInstalled,
      script_checked_at: checkedAt ?? now,
      check_error: errorValue,
      updated_at: now,
    };
    if (licence) update.is_licensed = licence.is_licensed;
    if (licence?.account) {
      update.account_id = licence.account.accountId;
      update.account_name = licence.account.accountName;
      update.account_email = licence.account.accountEmail;
    }

    // Update the domain record, only while it's still waiting for this result,
    // so a late result can't overwrite a Block, Dismiss or newer decision.
    const { data: updated, error: updateError } = await supabase
      .from("licensing_domains")
      .update(update)
      .eq("domain", domain)
      .eq("status", "pending_check")
      .select("id");

    if (updateError) {
      // 500 so the checker retries rather than the result being lost
      console.error(`[webhooks/checker] Failed to update ${domain}:`, updateError);
      return NextResponse.json({ error: "Failed to update domain" }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ success: true, ignored: true });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[webhooks/checker] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
