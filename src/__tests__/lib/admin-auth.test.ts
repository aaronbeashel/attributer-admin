import { describe, it, expect } from "vitest";
import { verifyAdminApiKey } from "@/lib/admin-auth";

describe("verifyAdminApiKey", () => {
  it("returns true for valid Bearer token", () => {
    const req = new Request("http://localhost", {
      headers: { authorization: `Bearer ${process.env.ADMIN_API_KEY}` },
    });
    expect(verifyAdminApiKey(req)).toBe(true);
  });

  it("returns false for missing header", () => {
    const req = new Request("http://localhost");
    expect(verifyAdminApiKey(req)).toBe(false);
  });

  it("returns false for wrong key", () => {
    const req = new Request("http://localhost", {
      headers: { authorization: "Bearer wrong-key" },
    });
    expect(verifyAdminApiKey(req)).toBe(false);
  });

  it("returns false for non-Bearer auth", () => {
    const req = new Request("http://localhost", {
      headers: { authorization: `Basic ${process.env.ADMIN_API_KEY}` },
    });
    expect(verifyAdminApiKey(req)).toBe(false);
  });

  it("returns false for empty Bearer token", () => {
    const req = new Request("http://localhost", {
      headers: { authorization: "Bearer " },
    });
    expect(verifyAdminApiKey(req)).toBe(false);
  });
});
