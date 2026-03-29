import { describe, it, expect } from "vitest";
import { normalizeDomain, deduplicateDomains } from "@/lib/licensing/normalize";

describe("normalizeDomain", () => {
  it("strips https protocol", () => {
    expect(normalizeDomain("https://example.com")).toBe("example.com");
  });

  it("strips http protocol", () => {
    expect(normalizeDomain("http://example.com")).toBe("example.com");
  });

  it("strips www prefix", () => {
    expect(normalizeDomain("www.example.com")).toBe("example.com");
  });

  it("strips path", () => {
    expect(normalizeDomain("example.com/page/about")).toBe("example.com");
  });

  it("strips port", () => {
    expect(normalizeDomain("example.com:8080")).toBe("example.com");
  });

  it("handles full URL with protocol, www, path, and port", () => {
    expect(normalizeDomain("https://www.example.com:443/page")).toBe("example.com");
  });

  it("lowercases domain", () => {
    expect(normalizeDomain("EXAMPLE.COM")).toBe("example.com");
    expect(normalizeDomain("Example.Com")).toBe("example.com");
  });

  it("trims whitespace", () => {
    expect(normalizeDomain("  example.com  ")).toBe("example.com");
  });

  it("handles subdomain", () => {
    expect(normalizeDomain("blog.example.com")).toBe("blog.example.com");
  });
});

describe("deduplicateDomains", () => {
  it("merges duplicate domains and sums call counts", () => {
    const input = [
      { domain: "www.example.com", callCount: 10 },
      { domain: "example.com", callCount: 5 },
      { domain: "https://Example.com/page", callCount: 3 },
    ];
    const result = deduplicateDomains(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ domain: "example.com", callCount: 18 });
  });

  it("sorts by call count descending", () => {
    const input = [
      { domain: "a.com", callCount: 1 },
      { domain: "b.com", callCount: 100 },
      { domain: "c.com", callCount: 50 },
    ];
    const result = deduplicateDomains(input);
    expect(result[0].domain).toBe("b.com");
    expect(result[1].domain).toBe("c.com");
    expect(result[2].domain).toBe("a.com");
  });

  it("handles empty input", () => {
    expect(deduplicateDomains([])).toEqual([]);
  });

  it("keeps unique domains separate", () => {
    const input = [
      { domain: "one.com", callCount: 5 },
      { domain: "two.com", callCount: 3 },
    ];
    const result = deduplicateDomains(input);
    expect(result).toHaveLength(2);
  });
});
