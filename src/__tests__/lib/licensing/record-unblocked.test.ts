import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordUnblocked } from "@/lib/licensing/record-unblocked";
import { createFakeLicensingDb } from "../../__mocks__/licensing-db";

const licensing_domains = [
  { domain: "acme.com", status: "blocked", is_blocked: true },
  { domain: "shop.acme.com", status: "confirmed_unlicensed", is_blocked: true },
  { domain: "other.com", status: "blocked", is_blocked: true },
];

function db(opts: { failWrites?: string[] } = {}) {
  return createFakeLicensingDb({ licensing_domains, licensing_reviews: [] }, opts);
}

describe("recordUnblocked", () => {
  it("resets the exact row and adds a review", async () => {
    const fake = db();
    await recordUnblocked(fake as unknown as SupabaseClient, "acme.com", "note", "admin@example.com");

    const rows = fake.rows("licensing_domains");
    expect(rows.find((r) => r.domain === "acme.com")).toMatchObject({
      status: "pending_check",
      is_blocked: false,
      reviewed_by: "admin@example.com",
      review_note: "note",
    });
    expect(rows.find((r) => r.domain === "shop.acme.com")).toMatchObject({ is_blocked: true });
    expect(fake.rows("licensing_reviews")).toEqual([
      { domain: "acme.com", action: "unblocked", reason: null, notes: "note", actioned_by: "admin@example.com" },
    ]);
  });

  it("resets every listed row when given rowDomains", async () => {
    const fake = db();
    await recordUnblocked(fake as unknown as SupabaseClient, "acme.com", null, "a@x.com", {
      rowDomains: ["shop.acme.com", "acme.com"],
    });

    const rows = fake.rows("licensing_domains");
    expect(rows.filter((r) => r.status === "pending_check").map((r) => r.domain).sort()).toEqual(["acme.com", "shop.acme.com"]);
    expect(rows.find((r) => r.domain === "other.com")).toMatchObject({ is_blocked: true });
  });

  it("attempts both writes, then throws when one fails", async () => {
    const fake = db({ failWrites: ["licensing_domains"] });

    await expect(recordUnblocked(fake as unknown as SupabaseClient, "acme.com", null, "admin")).rejects.toThrow(
      /Couldn't record the unblock of acme.com/
    );
    expect(fake.writes.map((w) => `${w.op} ${w.table}`)).toEqual(["update licensing_domains", "insert licensing_reviews"]);
    expect(fake.rows("licensing_reviews")).toHaveLength(1);
  });

  it("throws when the review insert fails", async () => {
    const fake = db({ failWrites: ["licensing_reviews"] });
    await expect(recordUnblocked(fake as unknown as SupabaseClient, "acme.com", null, "admin")).rejects.toThrow(/licensing_reviews/);
  });
});
