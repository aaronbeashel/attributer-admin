import { payingOwner, type Owner } from "@/lib/licensing/entitlement";

// Pure decision logic for the licensing refresh. The cron route, its tests and
// the production dry run all import these, so there is one copy of the rules.

export interface DomainRow {
  id: string;
  domain: string;
  status: string;
  account_id: string | null;
  account_name: string | null;
  account_email: string | null;
  is_licensed: boolean;
  is_blocked: boolean;
  script_installed: boolean | null;
  check_error: string | null;
}

export type RowState = Omit<DomainRow, "id" | "domain">;

export type Decision =
  | { kind: "final"; state: RowState }
  | {
      kind: "server_check";
      payingOwner: Owner | null;
      firstOwner: Owner | null;
      sharedHost: boolean;
      /** not_installed / check_failed on the monthly re-check: clear the old install result. */
      resetInstallCheck: boolean;
    };

const STATE_FIELDS: Array<keyof RowState> = [
  "status",
  "account_id",
  "account_name",
  "account_email",
  "is_licensed",
  "is_blocked",
  "script_installed",
  "check_error",
];

function stateOf(row: DomainRow): RowState {
  return {
    status: row.status,
    account_id: row.account_id,
    account_name: row.account_name,
    account_email: row.account_email,
    is_licensed: row.is_licensed,
    is_blocked: row.is_blocked,
    script_installed: row.script_installed,
    check_error: row.check_error,
  };
}

/** Account fields from an owner, or the row's stored ones. Never clears them to null. */
function withAccount(state: RowState, owner: Owner | null): RowState {
  if (!owner) return state;
  return { ...state, account_id: owner.accountId, account_name: owner.accountName, account_email: owner.accountEmail };
}

/** The not-blocked outcome: paying -> licensed, shared host -> shared_host, else null (caller decides). */
function notBlockedState(row: DomainRow, paying: Owner | null, sharedHost: boolean): RowState | null {
  if (sharedHost) return { ...stateOf(row), status: "shared_host", is_licensed: false };
  if (paying) return withAccount({ ...stateOf(row), status: "licensed", is_licensed: true }, paying);
  return null;
}

/**
 * Decide a licensing_domains row from its owners. Returns the final state, or
 * "server_check" when the licensing server has to say whether it's blocked.
 */
export function decideRow(row: DomainRow, owners: Owner[], sharedHost: boolean, monthlyRecheck: boolean): Decision {
  const paying = payingOwner(owners);
  const firstOwner = owners[0] ?? null;
  const serverCheck = (resetInstallCheck = false): Decision => ({
    kind: "server_check",
    payingOwner: paying,
    firstOwner,
    sharedHost,
    resetInstallCheck,
  });

  // Blocked rows stay blocked until the licensing server says otherwise, paying or not.
  if (row.status === "blocked") return serverCheck();

  const resolved = notBlockedState(row, paying, sharedHost);
  if (resolved) return { kind: "final", state: resolved };

  const unchanged: Decision = { kind: "final", state: withAccount(stateOf(row), firstOwner) };
  switch (row.status) {
    case "dismissed":
    case "confirmed_unlicensed":
    case "pending_check":
      return unchanged;
    case "not_installed":
    case "check_failed":
      return monthlyRecheck ? serverCheck(true) : unchanged;
    case "licensed":
    case "new":
    case "shared_host":
      return serverCheck();
    default:
      return unchanged;
  }
}

export interface ServerCheckResult { domain: string; isBlocked: boolean | null }

export interface RowWrite {
  id: string;
  domain: string;
  /** The status read at the start of the run. Writes are guarded on it. */
  fromStatus: string;
  update: Partial<RowState>;
}

export interface ServerCheckOutcome {
  writes: RowWrite[];
  finalRows: DomainRow[];
  statusCounts: Record<string, number>;
  payingButBlocked: string[];
  serverCheckFailed: number;
  breakerTripped: boolean;
}

/** More than this share of failed server checks means the licensing server is unwell. */
export const SERVER_CHECK_FAILURE_LIMIT = 0.05;

function stateFromServer(row: DomainRow, decision: Extract<Decision, { kind: "server_check" }>, isBlocked: boolean): RowState {
  const { payingOwner: paying, firstOwner } = decision;

  if (isBlocked) {
    return withAccount(
      { ...stateOf(row), status: "blocked", is_blocked: true, is_licensed: paying !== null },
      paying ?? firstOwner
    );
  }

  if (row.status === "blocked") {
    const resolved = notBlockedState(row, paying, decision.sharedHost);
    if (resolved) return { ...resolved, is_blocked: false };
  }

  const pending: RowState = { ...stateOf(row), status: "pending_check", is_blocked: false, is_licensed: false };
  if (decision.resetInstallCheck) {
    pending.script_installed = null;
    pending.check_error = null;
  }
  return withAccount(pending, firstOwner);
}

/**
 * Apply the licensing server's answers to the decisions. A null answer leaves
 * the row exactly as it was. If more than 5% of the checks failed, every
 * server-derived change is skipped this run (the breaker).
 */
export function applyServerCheck(
  rows: DomainRow[],
  decisions: Decision[],
  serverResults: ServerCheckResult[]
): ServerCheckOutcome {
  const answers = new Map(serverResults.map((r) => [r.domain, r.isBlocked]));

  let checked = 0;
  let serverCheckFailed = 0;
  for (let i = 0; i < rows.length; i++) {
    if (decisions[i].kind !== "server_check") continue;
    checked++;
    const answer = answers.get(rows[i].domain);
    if (answer === null || answer === undefined) serverCheckFailed++;
  }
  const breakerTripped = checked > 0 && serverCheckFailed / checked > SERVER_CHECK_FAILURE_LIMIT;

  const writes: RowWrite[] = [];
  const finalRows: DomainRow[] = [];
  const statusCounts: Record<string, number> = {};
  const payingButBlocked: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const decision = decisions[i];
    let next: RowState = stateOf(row);

    if (decision.kind === "final") {
      next = decision.state;
    } else {
      const answer = answers.get(row.domain);
      if (!breakerTripped && answer !== null && answer !== undefined) {
        next = stateFromServer(row, decision, answer);
      }
    }

    const update: Partial<RowState> = {};
    for (const field of STATE_FIELDS) {
      if (next[field] !== row[field]) (update as Record<string, unknown>)[field] = next[field];
    }
    if (Object.keys(update).length > 0) {
      writes.push({ id: row.id, domain: row.domain, fromStatus: row.status, update });
    }

    const finalRow: DomainRow = { ...row, ...next };
    finalRows.push(finalRow);
    statusCounts[finalRow.status] = (statusCounts[finalRow.status] ?? 0) + 1;
    if (finalRow.status === "blocked" && decision.kind === "server_check" && decision.payingOwner) {
      payingButBlocked.push(row.domain);
    }
  }

  return { writes, finalRows, statusCounts, payingButBlocked, serverCheckFailed, breakerTripped };
}
