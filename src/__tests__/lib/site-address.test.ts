import { describe, it, expect } from "vitest";
import { parseWebsiteAddress } from "@/lib/site-address";

// Verbatim copy of the customer app's normalizeDomain
// (attributer-app/src/lib/domain.ts). The admin edit must store the same
// domain the customer app would for every address the app accepts.
function appNormalizeDomain(url: string): string {
  try {
    let normalized = url.trim().toLowerCase();
    if (!normalized.startsWith("http")) {
      normalized = "https://" + normalized;
    }
    const parsed = new URL(normalized);
    let hostname = parsed.hostname;
    if (hostname.startsWith("www.")) {
      hostname = hostname.slice(4);
    }
    return hostname;
  } catch {
    return url.trim().toLowerCase();
  }
}

describe("parseWebsiteAddress", () => {
  it.each([
    ["acme.com", "https://acme.com", "acme.com"],
    ["https://acme.com", "https://acme.com", "acme.com"],
    ["http://acme.com", "http://acme.com", "acme.com"],
    ["www.acme.com", "https://www.acme.com", "acme.com"],
    ["https://www.acme.com", "https://www.acme.com", "acme.com"],
    ["  https://www.acme.com/  ", "https://www.acme.com/", "acme.com"],
    ["HTTPS://WWW.Acme.COM", "HTTPS://WWW.Acme.COM", "acme.com"],
    ["https://www.acme.com/pricing/plans", "https://www.acme.com/pricing/plans", "acme.com"],
    ["https://acme.com:8443", "https://acme.com:8443", "acme.com"],
    ["https://acme.com/?utm_source=google#top", "https://acme.com/?utm_source=google#top", "acme.com"],
    ["https://user:secret@acme.com", "https://user:secret@acme.com", "acme.com"],
    ["https://shop.acme.com", "https://shop.acme.com", "shop.acme.com"],
    ["https://www.www.acme.com", "https://www.www.acme.com", "www.acme.com"],
    ["https://acme.com.au", "https://acme.com.au", "acme.com.au"],
    ["https://bücher.de", "https://bücher.de", "xn--bcher-kva.de"],
    ["https://BÜCHER.de", "https://BÜCHER.de", "xn--bcher-kva.de"],
    ["https://ex%41mple.com", "https://ex%41mple.com", "example.com"],
  ])("parses %s", (input, websiteUrl, domain) => {
    expect(parseWebsiteAddress(input)).toEqual({ ok: true, websiteUrl, domain });
  });

  it.each([
    "acme.com",
    "https://acme.com",
    "www.acme.com",
    "HTTPS://WWW.Acme.COM",
    "https://www.acme.com/pricing/plans",
    "https://acme.com:8443",
    "https://acme.com/?utm_source=google#top",
    "https://user:secret@acme.com",
    "https://shop.acme.com",
    "https://www.www.acme.com",
    "https://bücher.de",
    "https://BÜCHER.de",
    "https://ex%41mple.com",
  ])("stores the same domain as the customer app for %s", (input) => {
    const parsed = parseWebsiteAddress(input);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.domain).toBe(appNormalizeDomain(input));
  });

  it("asks for an address when it's empty", () => {
    expect(parseWebsiteAddress("")).toEqual({ ok: false, error: "Enter a website address." });
    expect(parseWebsiteAddress("   ")).toEqual({ ok: false, error: "Enter a website address." });
  });

  it.each([
    ["IPv4", "https://192.168.0.1"],
    ["IPv4 without a scheme", "10.0.0.1"],
    ["IPv6", "https://[::1]"],
    ["a bare public suffix", "https://co.uk"],
    ["a one-label host", "https://localhost"],
    ["garbage", "not a website"],
    ["a scheme with no host", "https://"],
    ["an underscore host", "https://my_site.com"],
    ["a trailing dot", "https://acme.com."],
    ["a 254-character host", `https://${"a".repeat(250)}.com`],
    ["a 2049-character URL", `https://acme.com/${"a".repeat(2049 - "https://acme.com/".length)}`],
  ])("refuses %s", (_label, input) => {
    expect(parseWebsiteAddress(input)).toEqual({ ok: false, error: "That isn't a valid website address." });
  });

  it("accepts a 253-character host and a 2048-character URL", () => {
    const host = `${"a".repeat(249)}.com`;
    expect(host).toHaveLength(253);
    expect(parseWebsiteAddress(`https://${host}`)).toEqual({ ok: true, websiteUrl: `https://${host}`, domain: host });

    const url = `https://acme.com/${"a".repeat(2048 - "https://acme.com/".length)}`;
    expect(url).toHaveLength(2048);
    expect(parseWebsiteAddress(url)).toMatchObject({ ok: true, domain: "acme.com" });
  });
});
