import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseCSV } from "@/lib/licensing/process-csv";
import { normalizeDomain, deduplicateDomains } from "@/lib/licensing/normalize";
import { checkBlockedDomains } from "@/lib/external/blocklist";
import { submitBatchCheck } from "@/lib/external/install-checker";

// Helper: check if a domain has a licensed account (active/trialing subscription)
async function checkDomainLicensed(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  domain: string
): Promise<{ isLicensed: boolean; account: { id: string; name: string; email: string } | null }> {
  const { data: sites } = await supabase
    .from("sites")
    .select("domain, accounts(id, name, email, subscriptions(status))")
    .eq("domain", domain);

  let bestAccount: { id: string; name: string; email: string } | null = null;

  for (const site of sites ?? []) {
    const account = site.accounts as unknown as {
      id: string; name: string; email: string;
      subscriptions: Array<{ status: string }>;
    } | null;
    if (!account) continue;

    // Track any account context
    bestAccount = { id: account.id, name: account.name, email: account.email };

    const hasActiveSub = account.subscriptions?.some(
      (s) => s.status === "active" || s.status === "trialing"
    );
    if (hasActiveSub) {
      return { isLicensed: true, account: bestAccount };
    }
  }

  return { isLicensed: false, account: bestAccount };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serverUrl = process.env.LICENSING_SERVER_URL || "https://licenses.attributer.io";
  const username = process.env.LICENSING_SERVER_USERNAME || "attributer";
  const password = process.env.LICENSING_SERVER_PASSWORD || "";

  try {
    // Step 1: Fetch and parse CSV
    const csvRes = await fetch(`${serverUrl}/report.csv`, {
      headers: {
        Authorization: "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
      },
      signal: AbortSignal.timeout(60000),
    });

    if (!csvRes.ok) {
      return NextResponse.json({ error: `Failed to fetch CSV: HTTP ${csvRes.status}` }, { status: 502 });
    }

    const csvText = await csvRes.text();
    if (!csvText.trim()) {
      return NextResponse.json({ success: true, message: "CSV was empty", totalRows: 0 });
    }

    const rawRows = parseCSV(csvText);
    if (rawRows.length === 0) {
      return NextResponse.json({ success: true, message: "No valid rows in CSV", totalRows: 0 });
    }

    const normalized = rawRows.map((row) => ({ ...row, domain: normalizeDomain(row.domain) }));
    const deduplicated = deduplicateDomains(normalized)
      .filter((d) => d.callCount >= 50); // Skip low-traffic noise

    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    // Step 2: Upsert all domains in batches of 500
    for (let i = 0; i < deduplicated.length; i += 500) {
      const batch = deduplicated.slice(i, i + 500).map((d) => ({
        domain: d.domain,
        call_count: d.callCount,
        last_seen_at: now,
        updated_at: now,
      }));
      await supabase
        .from("licensing_domains")
        .upsert(batch, { onConflict: "domain", ignoreDuplicates: false });
    }

    // Step 3: Fast checks on 'new' domains (fetch all, not just default 1000)
    const allNewDomains: Array<{ id: string; domain: string }> = [];
    let offset = 0;
    while (true) {
      const { data: batch } = await supabase
        .from("licensing_domains")
        .select("id, domain")
        .eq("status", "new")
        .range(offset, offset + 999);
      if (!batch || batch.length === 0) break;
      allNewDomains.push(...batch);
      if (batch.length < 1000) break;
      offset += 1000;
    }
    const newDomains = allNewDomains;

    if (newDomains && newDomains.length > 0) {
      const licensedIds = new Set<string>();

      // Check each domain individually for license status
      for (const d of newDomains) {
        const { isLicensed, account } = await checkDomainLicensed(supabase, d.domain);

        if (isLicensed && account) {
          await supabase.from("licensing_domains").update({
            status: "licensed",
            is_licensed: true,
            account_id: account.id,
            account_name: account.name,
            account_email: account.email,
            updated_at: now,
          }).eq("id", d.id);
          licensedIds.add(d.id);
        } else if (account) {
          // Has an account but not licensed — store context for display
          await supabase.from("licensing_domains").update({
            account_id: account.id,
            account_name: account.name,
            account_email: account.email,
            updated_at: now,
          }).eq("id", d.id);
        }
      }

      // Check blocked on licensing server (only non-licensed new domains)
      const unlicensedNew = newDomains.filter((d) => !licensedIds.has(d.id));
      if (unlicensedNew.length > 0) {
        const blockedResults = await checkBlockedDomains(unlicensedNew.map((d) => d.domain));
        const blockedSet = new Set(blockedResults.filter((r) => r.isBlocked).map((r) => r.domain));

        for (const d of unlicensedNew) {
          if (blockedSet.has(d.domain)) {
            await supabase.from("licensing_domains").update({
              status: "blocked",
              is_blocked: true,
              updated_at: now,
            }).eq("id", d.id);
          } else {
            await supabase.from("licensing_domains").update({
              status: "pending_check",
              updated_at: now,
            }).eq("id", d.id);
          }
        }
      }
    }

    // Step 4: Re-check 'licensed' domains (subscription may have been cancelled)
    const allLicensedDomains: Array<{ id: string; domain: string }> = [];
    let licOffset = 0;
    while (true) {
      const { data: batch } = await supabase
        .from("licensing_domains")
        .select("id, domain")
        .eq("status", "licensed")
        .range(licOffset, licOffset + 999);
      if (!batch || batch.length === 0) break;
      allLicensedDomains.push(...batch);
      if (batch.length < 1000) break;
      licOffset += 1000;
    }
    const licensedDomains = allLicensedDomains;

    if (licensedDomains && licensedDomains.length > 0) {
      for (const d of licensedDomains) {
        const { isLicensed } = await checkDomainLicensed(supabase, d.domain);
        if (!isLicensed) {
          await supabase.from("licensing_domains").update({
            status: "pending_check", is_licensed: false, updated_at: now,
          }).eq("id", d.id);
        }
      }
    }

    // Step 5: Re-check 'blocked' domains (may have been unblocked)
    const allBlockedDomains: Array<{ id: string; domain: string }> = [];
    let blkOffset = 0;
    while (true) {
      const { data: batch } = await supabase
        .from("licensing_domains")
        .select("id, domain")
        .eq("status", "blocked")
        .range(blkOffset, blkOffset + 999);
      if (!batch || batch.length === 0) break;
      allBlockedDomains.push(...batch);
      if (batch.length < 1000) break;
      blkOffset += 1000;
    }
    const blockedDomains = allBlockedDomains;

    if (blockedDomains && blockedDomains.length > 0) {
      const recheck = await checkBlockedDomains(blockedDomains.map((d) => d.domain));
      const stillBlocked = new Set(recheck.filter((r) => r.isBlocked).map((r) => r.domain));

      for (const d of blockedDomains) {
        if (!stillBlocked.has(d.domain)) {
          await supabase.from("licensing_domains").update({
            status: "pending_check", is_blocked: false, updated_at: now,
          }).eq("id", d.id);
        }
      }
    }

    // Step 6: Reset 'check_failed' to 'pending_check' for retry
    await supabase.from("licensing_domains").update({
      status: "pending_check", check_error: null, updated_at: now,
    }).eq("status", "check_failed");

    // Step 7: Submit all pending_check domains to checker service via batch
    const adminAppUrl = process.env.ADMIN_APP_URL;
    const webhookSecret = process.env.CHECKER_WEBHOOK_SECRET;
    let batchSubmitted = false;

    if (adminAppUrl && webhookSecret) {
      const allPending: Array<{ domain: string }> = [];
      let pendOffset = 0;
      while (true) {
        const { data: batch } = await supabase
          .from("licensing_domains")
          .select("domain")
          .eq("status", "pending_check")
          .range(pendOffset, pendOffset + 999);
        if (!batch || batch.length === 0) break;
        allPending.push(...batch);
        if (batch.length < 1000) break;
        pendOffset += 1000;
      }

      if (allPending.length > 0) {
        const webhookUrl = `${adminAppUrl}/api/webhooks/checker`;
        try {
          const batchResult = await submitBatchCheck(
            allPending.map((d) => d.domain),
            webhookUrl,
            webhookSecret
          );
          console.log(`[cron/licensing] Submitted batch ${batchResult.batch_id}: ${batchResult.total} domains`);
          batchSubmitted = true;
        } catch (err) {
          console.error("[cron/licensing] Failed to submit batch check:", err);
        }
      }
    }

    // Get counts for response
    const { count: pendingCount } = await supabase
      .from("licensing_domains")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending_check");

    return NextResponse.json({
      success: true,
      totalRows: rawRows.length,
      uniqueDomains: deduplicated.length,
      pendingInstallCheck: pendingCount ?? 0,
      batchSubmitted,
    });
  } catch (err) {
    console.error("[cron/licensing] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
