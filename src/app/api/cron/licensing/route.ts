import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseCSV } from "@/lib/licensing/process-csv";
import { normalizeDomain, deduplicateDomains } from "@/lib/licensing/normalize";
import { checkBlockedDomainsStrict } from "@/lib/external/blocklist";
import { submitBatchCheck } from "@/lib/external/install-checker";
import { findOwners, loadSnapshot, type LicensingSnapshot } from "@/lib/licensing/entitlement";
import { isSharedHost } from "@/lib/licensing/domain-match";
import { applyServerCheck, decideRow, withoutUnappliedWrites, type DomainRow } from "@/lib/licensing/decide";
import { loadAllRows } from "@/lib/licensing/load-all";

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

    // Step 3: Load who pays for what, and every licensing row. Partial data
    // must never drive the list, so any failure stops here with nothing written.
    let snapshot: LicensingSnapshot;
    let rows: DomainRow[];
    try {
      snapshot = await loadSnapshot(supabase);
      rows = await loadAllRows<DomainRow>(
        supabase,
        "licensing_domains",
        "id, domain, status, account_id, account_name, account_email, is_licensed, is_blocked, script_installed, check_error"
      );
    } catch (err) {
      console.error("[cron/licensing] Failed to load licensing data, nothing written:", err);
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }

    // Step 4: Decide every row. not_installed and check_failed are only re-queued
    // on the first run of each month (install checker cost), unless ?recheck= says.
    const recheckParam = new URL(request.url).searchParams.get("recheck");
    const monthlyRecheck =
      recheckParam === "1" ? true : recheckParam === "0" ? false : new Date().getUTCDate() <= 7;

    const decisions = rows.map((row) =>
      decideRow(row, findOwners(snapshot, row.domain), isSharedHost(row.domain), monthlyRecheck)
    );

    // Step 5: One licensing server check for everything that needs it
    const toCheck = rows.filter((_, i) => decisions[i].kind === "server_check").map((row) => row.domain);
    const serverResults = toCheck.length > 0 ? await checkBlockedDomainsStrict(toCheck) : [];
    const outcome = applyServerCheck(rows, decisions, serverResults);

    if (outcome.breakerTripped) {
      console.error(
        `[cron/licensing] Licensing server failed ${outcome.serverCheckFailed} of ${toCheck.length} checks, skipping every server-derived change this run`
      );
    }

    // Step 6: Write only rows whose state changed, guarded on the status read in
    // step 3 so a Block or Dismiss clicked during the run isn't overwritten.
    let changed = 0;
    let writeErrors = 0;
    let skippedByStatusGuard = 0;
    const unapplied = new Set<string>();
    for (const write of outcome.writes) {
      const { data: written, error } = await supabase
        .from("licensing_domains")
        .update({ ...write.update, updated_at: now })
        .eq("id", write.id)
        .eq("status", write.fromStatus)
        .select("id");
      if (error) {
        writeErrors++;
        unapplied.add(write.id);
        console.error(`[cron/licensing] Failed to update ${write.domain}:`, error);
      } else if (!written || written.length === 0) {
        skippedByStatusGuard++;
        unapplied.add(write.id);
      } else {
        changed++;
      }
    }
    const settled = withoutUnappliedWrites(rows, outcome, unapplied);

    // Step 7: Submit all 'pending_check' domains to checker service via batch
    const adminAppUrl = process.env.ADMIN_APP_URL;
    const webhookSecret = process.env.CHECKER_WEBHOOK_SECRET;
    let batchSubmitted = false;
    const pendingDomains = settled.finalRows.filter((row) => row.status === "pending_check").map((row) => row.domain);

    if (adminAppUrl && webhookSecret && pendingDomains.length > 0) {
      const webhookUrl = `${adminAppUrl}/api/webhooks/checker`;
      try {
        const batchResult = await submitBatchCheck(pendingDomains, webhookUrl, webhookSecret);
        console.log(`[cron/licensing] Submitted batch ${batchResult.batch_id}: ${batchResult.total} domains`);
        batchSubmitted = true;
      } catch (err) {
        console.error("[cron/licensing] Failed to submit batch check:", err);
      }
    }

    const summary = {
      success: !outcome.breakerTripped,
      ...(outcome.breakerTripped
        ? { error: `Licensing server failed ${outcome.serverCheckFailed} of ${toCheck.length} checks, server-derived changes skipped` }
        : {}),
      totalRows: rawRows.length,
      uniqueDomains: deduplicated.length,
      pendingInstallCheck: pendingDomains.length,
      batchSubmitted,
      statusCounts: settled.statusCounts,
      changed,
      skippedByStatusGuard,
      writeErrors,
      serverCheckFailed: outcome.serverCheckFailed,
      breakerTripped: outcome.breakerTripped,
      payingButBlocked: settled.payingButBlocked,
    };
    console.log(`[cron/licensing] Summary ${JSON.stringify(summary)}`);

    // 503 when the breaker tripped, so the run shows as failed in the logs
    return NextResponse.json(summary, { status: outcome.breakerTripped ? 503 : 200 });
  } catch (err) {
    console.error("[cron/licensing] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
