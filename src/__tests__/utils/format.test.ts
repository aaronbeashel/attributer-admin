import { describe, it, expect } from "vitest";
import { formatCurrency, formatDate, formatNumber, formatPercentChange } from "@/lib/utils/format";

describe("formatCurrency", () => {
  it("formats cents to dollar string", () => {
    expect(formatCurrency(4900)).toBe("$49.00");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("formats single cent", () => {
    expect(formatCurrency(1)).toBe("$0.01");
  });

  it("formats large amounts", () => {
    expect(formatCurrency(999900)).toBe("$9,999.00");
  });
});

describe("formatDate", () => {
  it("returns dash for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("returns dash for undefined", () => {
    expect(formatDate(undefined)).toBe("—");
  });

  it("formats a date string", () => {
    const result = formatDate("2025-01-15T00:00:00Z");
    // The exact output depends on timezone, but it should contain the year
    expect(result).toContain("2025");
  });

  it("formats a Date object", () => {
    const result = formatDate(new Date("2025-06-01T00:00:00Z"));
    expect(result).toContain("2025");
  });
});

describe("formatNumber", () => {
  it("formats with commas", () => {
    expect(formatNumber(1000)).toBe("1,000");
    expect(formatNumber(1000000)).toBe("1,000,000");
  });

  it("formats small numbers without commas", () => {
    expect(formatNumber(42)).toBe("42");
  });
});

describe("formatPercentChange", () => {
  it("calculates positive change", () => {
    const result = formatPercentChange(150, 100);
    expect(result.value).toBe("+50.0%");
    expect(result.positive).toBe(true);
  });

  it("calculates negative change", () => {
    const result = formatPercentChange(50, 100);
    expect(result.value).toBe("-50.0%");
    expect(result.positive).toBe(false);
  });

  it("handles zero change", () => {
    const result = formatPercentChange(100, 100);
    expect(result.value).toBe("+0.0%");
    expect(result.positive).toBe(true);
  });

  it("handles zero previous value", () => {
    const result = formatPercentChange(100, 0);
    expect(result.value).toBe("—");
  });
});
