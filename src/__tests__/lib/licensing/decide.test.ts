import { describe, it, expect } from "vitest";
import { applyServerCheck, decideRow, type Decision, type DomainRow } from "@/lib/licensing/decide";
import type { Owner } from "@/lib/licensing/entitlement";

const row = (overrides: Partial<DomainRow> = {}): DomainRow => ({
  id: "row_1",
  domain: "acme.com",
  status: "new",
  account_id: null,
  account_name: null,
  account_email: null,
  is_licensed: false,
  is_blocked: false,
  script_installed: null,
  check_error: null,
  ...overrides,
});

const owner = (overrides: Partial<Owner> = {}): Owner => ({
  accountId: "acc_pay",
  accountName: "Acme",
  accountEmail: "ops@acme.com",
  accountPaying: true,
  activeSites: [{ domain: "acme.com", status: "active" }],
  suspendedSites: [],
  inactiveSites: [],
  planName: "Starter",
  latestStatus: "active",
  latestStripeSubscriptionId: "sub_1",
  stripeCustomerIds: ["cus_1"],
  accountActiveSiteCount: 1,
  ...overrides,
});

const lapsed = owner({ accountId: "acc_old", accountName: "Old", accountEmail: "old@acme.com", accountPaying: false, latestStatus: "cancelled" });

function finalState(decision: Decision) {
  if (decision.kind !== "final") throw new Error(`expected final, got ${decision.kind}`);
  return decision.state;
}

describe("decideRow", () => {
  it("sends blocked rows to the server check whatever the owners say", () => {
    expect(decideRow(row({ status: "blocked" }), [owner()], false, false).kind).toBe("server_check");
    expect(decideRow(row({ status: "blocked" }), [], true, false).kind).toBe("server_check");
    expect(decideRow(row({ status: "blocked" }), [], false, false).kind).toBe("server_check");
  });

  it("marks a shared host shared_host and not licensed", () => {
    const state = finalState(decideRow(row({ status: "confirmed_unlicensed", is_licensed: true }), [owner()], true, false));
    expect(state).toMatchObject({ status: "shared_host", is_licensed: false });
  });

  it("marks a row with a paying owner licensed with the owner's account", () => {
    const state = finalState(decideRow(row({ status: "new" }), [owner()], false, false));
    expect(state).toMatchObject({
      status: "licensed",
      is_licensed: true,
      account_id: "acc_pay",
      account_name: "Acme",
      account_email: "ops@acme.com",
    });
  });

  it("lifts confirmed_unlicensed to licensed for a past_due owner", () => {
    const pastDue = owner({ latestStatus: "past_due" });
    const state = finalState(decideRow(row({ status: "confirmed_unlicensed" }), [pastDue], false, false));
    expect(state.status).toBe("licensed");
  });

  it("does not license from a paying account whose related site isn't active", () => {
    const removed = owner({ activeSites: [], inactiveSites: [{ domain: "acme.com", status: "inactive" }] });
    const state = finalState(decideRow(row({ status: "confirmed_unlicensed" }), [removed], false, false));
    expect(state.status).toBe("confirmed_unlicensed");
  });

  it.each(["dismissed", "confirmed_unlicensed", "pending_check"])("leaves %s unchanged with no paying owner", (status) => {
    const original = row({ status, script_installed: true, is_licensed: false });
    const state = finalState(decideRow(original, [], false, true));
    expect({ id: original.id, domain: original.domain, ...state }).toEqual(original);
  });

  it.each(["not_installed", "check_failed"])("leaves %s unchanged unless it's the monthly re-check", (status) => {
    expect(finalState(decideRow(row({ status }), [], false, false)).status).toBe(status);
    const decision = decideRow(row({ status }), [], false, true);
    expect(decision).toMatchObject({ kind: "server_check", resetInstallCheck: true });
  });

  it.each(["licensed", "new", "shared_host"])("sends %s with no paying owner to the server check", (status) => {
    const decision = decideRow(row({ status }), [lapsed], false, false);
    expect(decision).toMatchObject({ kind: "server_check", payingOwner: null, firstOwner: lapsed, resetInstallCheck: false });
  });

  it("stores the first owner's account fields on a non-paying row", () => {
    const state = finalState(decideRow(row({ status: "confirmed_unlicensed" }), [lapsed], false, false));
    expect(state).toMatchObject({ account_id: "acc_old", account_email: "old@acme.com" });
  });

  it("never clears stored account fields when there's no owner", () => {
    const stored = row({ status: "confirmed_unlicensed", account_id: "acc_x", account_name: "X", account_email: "x@x.com" });
    const state = finalState(decideRow(stored, [], false, false));
    expect(state).toMatchObject({ account_id: "acc_x", account_name: "X", account_email: "x@x.com" });
  });
});

describe("applyServerCheck", () => {
  function run(rows: DomainRow[], owners: Owner[][], answers: Array<boolean | null>, opts: { shared?: boolean[]; monthly?: boolean } = {}) {
    const decisions = rows.map((r, i) => decideRow(r, owners[i] ?? [], opts.shared?.[i] ?? false, opts.monthly ?? false));
    const results = rows.map((r, i) => ({ domain: r.domain, isBlocked: answers[i] ?? null }));
    return applyServerCheck(rows, decisions, results);
  }

  it("keeps a still-blocked paying domain blocked, marks it licensed and reports it", () => {
    const out = run([row({ status: "blocked", is_blocked: true })], [[owner()]], [true]);
    expect(out.finalRows[0]).toMatchObject({ status: "blocked", is_blocked: true, is_licensed: true, account_id: "acc_pay" });
    expect(out.payingButBlocked).toEqual(["acme.com"]);
  });

  it("makes a blocked-then-unblocked domain with a paying owner licensed", () => {
    const out = run([row({ status: "blocked", is_blocked: true })], [[owner()]], [false]);
    expect(out.finalRows[0]).toMatchObject({ status: "licensed", is_blocked: false, is_licensed: true, account_id: "acc_pay" });
    expect(out.payingButBlocked).toEqual([]);
  });

  it("keeps a blocked shared host blocked", () => {
    const out = run([row({ domain: "webflow.io", status: "blocked", is_blocked: true })], [[]], [true], { shared: [true] });
    expect(out.finalRows[0]).toMatchObject({ status: "blocked", is_blocked: true });
    expect(out.writes).toEqual([]);
  });

  it("makes an unblocked shared host shared_host", () => {
    const out = run([row({ domain: "webflow.io", status: "blocked", is_blocked: true })], [[]], [false], { shared: [true] });
    expect(out.finalRows[0]).toMatchObject({ status: "shared_host", is_blocked: false, is_licensed: false });
  });

  it("sends an unblocked domain with no payer to pending_check", () => {
    const out = run([row({ status: "blocked", is_blocked: true })], [[lapsed]], [false]);
    expect(out.finalRows[0]).toMatchObject({ status: "pending_check", is_blocked: false, account_id: "acc_old" });
  });

  it("marks a new domain the server reports blocked as blocked", () => {
    const out = run([row({ status: "new" })], [[]], [true]);
    expect(out.finalRows[0]).toMatchObject({ status: "blocked", is_blocked: true, is_licensed: false });
    expect(out.payingButBlocked).toEqual([]);
  });

  it("sends a lapsed licensed domain to pending_check and clears is_licensed", () => {
    const out = run([row({ status: "licensed", is_licensed: true, account_id: "acc_old" })], [[lapsed]], [false]);
    expect(out.finalRows[0]).toMatchObject({ status: "pending_check", is_licensed: false, is_blocked: false });
  });

  it("clears the old install result on the monthly re-check", () => {
    const out = run(
      [row({ status: "not_installed", script_installed: false, check_error: "old" })],
      [[]],
      [false],
      { monthly: true }
    );
    expect(out.finalRows[0]).toMatchObject({ status: "pending_check", script_installed: null, check_error: null });
  });

  it("leaves a row exactly as it was when the server check fails, and counts it", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row({ id: `r${i}`, domain: `d${i}.com`, status: "new" }));
    rows[0] = row({ id: "r0", domain: "d0.com", status: "blocked", is_blocked: true });
    const answers = rows.map((_, i) => (i === 0 ? null : false));
    const out = run(rows, [[owner()]], answers);
    expect(out.serverCheckFailed).toBe(1);
    expect(out.breakerTripped).toBe(false);
    expect(out.finalRows[0]).toEqual(rows[0]);
    expect(out.writes.find((w) => w.id === "r0")).toBeUndefined();
    // the paying-but-blocked row is still blocked in our records, so it's still reported
    expect(out.payingButBlocked).toEqual(["d0.com"]);
  });

  it("does not trip the breaker at exactly 5%", () => {
    const rows = Array.from({ length: 20 }, (_, i) => row({ id: `r${i}`, domain: `d${i}.com`, status: "new" }));
    const out = run(rows, [], rows.map((_, i) => (i === 0 ? null : false)));
    expect(out.breakerTripped).toBe(false);
    expect(out.writes).toHaveLength(19);
  });

  it("skips every server-derived write above 5% failures but keeps the others", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => row({ id: `r${i}`, domain: `d${i}.com`, status: "new" })),
      row({ id: "paid", domain: "paid.com", status: "confirmed_unlicensed" }),
    ];
    const owners: Owner[][] = rows.map((r) => (r.id === "paid" ? [owner()] : []));
    const answers = rows.map((_, i) => (i < 2 ? null : true));
    const out = run(rows, owners, answers);
    expect(out.serverCheckFailed).toBe(2);
    expect(out.breakerTripped).toBe(true);
    expect(out.writes.map((w) => w.id)).toEqual(["paid"]);
    expect(out.statusCounts).toEqual({ new: 10, licensed: 1 });
  });

  it("writes only changed rows, with the status they were read with", () => {
    const rows = [
      row({ id: "same", domain: "same.com", status: "confirmed_unlicensed" }),
      row({ id: "lift", domain: "lift.com", status: "confirmed_unlicensed" }),
    ];
    const decisions = [decideRow(rows[0], [], false, false), decideRow(rows[1], [owner()], false, false)];
    const out = applyServerCheck(rows, decisions, []);
    expect(out.writes).toEqual([
      {
        id: "lift",
        domain: "lift.com",
        fromStatus: "confirmed_unlicensed",
        update: { status: "licensed", is_licensed: true, account_id: "acc_pay", account_name: "Acme", account_email: "ops@acme.com" },
      },
    ]);
  });

  it("leaves dismissed alone", () => {
    const out = run([row({ status: "dismissed" })], [[]], []);
    expect(out.writes).toEqual([]);
    expect(out.statusCounts).toEqual({ dismissed: 1 });
  });
});
