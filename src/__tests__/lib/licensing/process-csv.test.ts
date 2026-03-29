import { describe, it, expect } from "vitest";
import { parseCSV } from "@/lib/licensing/process-csv";

describe("parseCSV", () => {
  it("parses standard CSV with domain and count columns", () => {
    const csv = "domain,call_count\nexample.com,42\ntest.org,7";
    const result = parseCSV(csv);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ domain: "example.com", callCount: 42 });
    expect(result[1]).toEqual({ domain: "test.org", callCount: 7 });
  });

  it("handles 'url' as domain column name", () => {
    const csv = "url,hits\nexample.com,10";
    const result = parseCSV(csv);
    expect(result[0].domain).toBe("example.com");
    expect(result[0].callCount).toBe(10);
  });

  it("handles 'site' as domain column name", () => {
    const csv = "site,requests\nexample.com,5";
    const result = parseCSV(csv);
    expect(result[0].domain).toBe("example.com");
    expect(result[0].callCount).toBe(5);
  });

  it("handles 'calls' as count column name", () => {
    const csv = "domain,calls\nexample.com,99";
    const result = parseCSV(csv);
    expect(result[0].callCount).toBe(99);
  });

  it("returns empty array for header-only CSV", () => {
    expect(parseCSV("domain,count")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseCSV("")).toEqual([]);
  });

  it("returns empty array when no domain column found", () => {
    const csv = "name,value\nfoo,bar";
    expect(parseCSV(csv)).toEqual([]);
  });

  it("defaults callCount to 0 when no count column", () => {
    const csv = "domain\nexample.com";
    const result = parseCSV(csv);
    expect(result[0].callCount).toBe(0);
  });

  it("skips rows with empty domain", () => {
    const csv = "domain,count\n,5\nexample.com,3";
    const result = parseCSV(csv);
    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe("example.com");
  });

  it("handles non-numeric count values gracefully", () => {
    const csv = "domain,count\nexample.com,abc";
    const result = parseCSV(csv);
    expect(result[0].callCount).toBe(0);
  });

  it("trims whitespace from headers and values", () => {
    const csv = " domain , count \n example.com , 42 ";
    const result = parseCSV(csv);
    expect(result[0].domain).toBe("example.com");
    expect(result[0].callCount).toBe(42);
  });
});
