import { describe, it, expect } from "vitest";
import {
  domainSuffixes,
  isRelated,
  isSharedHost,
  MULTI_PART_PUBLIC_SUFFIXES,
  registrableRoot,
  rootFamily,
  SHARED_HOST_ROOTS,
} from "@/lib/licensing/domain-match";

describe("isRelated", () => {
  it("matches equal domains", () => {
    expect(isRelated("greenvolt.com", "greenvolt.com")).toBe(true);
  });

  it("matches a site on a subdomain of the report domain", () => {
    expect(isRelated("greenvolt.com", "next.greenvolt.com")).toBe(true);
  });

  it("matches a report domain that is a subdomain of the site", () => {
    expect(isRelated("shop.greenvolt.com", "greenvolt.com")).toBe(true);
  });

  it("does not match look-alikes", () => {
    expect(isRelated("greenvolt.com", "notgreenvolt.com")).toBe(false);
    expect(isRelated("notgreenvolt.com", "greenvolt.com")).toBe(false);
    expect(isRelated("greenvolt.com", "greenvolt.com.au")).toBe(false);
    expect(isRelated("greenvolt.com.au", "greenvolt.com")).toBe(false);
  });

  it("strips www and protocol before comparing", () => {
    expect(isRelated("https://www.greenvolt.com/", "WWW.Greenvolt.com")).toBe(true);
    expect(isRelated("greenvolt.com", "https://next.greenvolt.com/path")).toBe(true);
  });

  it("is false for empty inputs", () => {
    expect(isRelated("", "greenvolt.com")).toBe(false);
    expect(isRelated("greenvolt.com", "")).toBe(false);
  });

  it("is false when either side is a shared host", () => {
    expect(isRelated("webflow.io", "acme.webflow.io")).toBe(false);
    expect(isRelated("acme.webflow.io", "acme.webflow.io")).toBe(false);
    expect(isRelated("acme.com", "acme.com.webflow.io")).toBe(false);
  });

  it("is false when the site is one label or a bare public suffix", () => {
    expect(isRelated("acme.com.au", "com.au")).toBe(false);
    expect(isRelated("acme.com", "com")).toBe(false);
    expect(isRelated("localhost", "localhost")).toBe(false);
  });

  it("is false when the report domain is one label or a bare public suffix", () => {
    expect(isRelated("co.uk", "acme.co.uk")).toBe(false);
    expect(isRelated("com.au", "shop.acme.com.au")).toBe(false);
    expect(isRelated("com", "acme.com")).toBe(false);
  });
});

describe("domainSuffixes", () => {
  it("lists proper parents with at least two labels", () => {
    expect(domainSuffixes("a.b.example.com")).toEqual(["b.example.com", "example.com"]);
  });

  it("includes the public suffix for a multi-part suffix domain", () => {
    expect(domainSuffixes("shop.example.co.uk")).toEqual(["example.co.uk", "co.uk"]);
  });

  it("is empty for a two-label domain", () => {
    expect(domainSuffixes("example.com")).toEqual([]);
  });
});

describe("rootFamily", () => {
  it("is the domain and its parents", () => {
    expect(rootFamily("a.b.example.com")).toEqual(["a.b.example.com", "b.example.com", "example.com"]);
  });

  it("excludes the bare public suffix", () => {
    expect(rootFamily("shop.example.co.uk")).toEqual(["shop.example.co.uk", "example.co.uk"]);
  });

  it("is just the domain for a two-label domain", () => {
    expect(rootFamily("example.com")).toEqual(["example.com"]);
  });

  it("is empty for a bare public suffix", () => {
    expect(rootFamily("co.uk")).toEqual([]);
  });
});

describe("registrableRoot", () => {
  it("takes the last two labels", () => {
    expect(registrableRoot("app.qbench.net")).toBe("qbench.net");
  });

  it("takes three labels under a multi-part public suffix", () => {
    expect(registrableRoot("shop.onecpm.co.uk")).toBe("onecpm.co.uk");
  });

  it("leaves a two-label domain alone", () => {
    expect(registrableRoot("qbench.com")).toBe("qbench.com");
  });
});

describe("isSharedHost", () => {
  it("is true for each root", () => {
    for (const root of SHARED_HOST_ROOTS) expect(isSharedHost(root)).toBe(true);
  });

  it("is true for subdomains of a root", () => {
    expect(isSharedHost("acme.webflow.io")).toBe(true);
    expect(isSharedHost("https://www.acme.wpengine.com")).toBe(true);
    expect(isSharedHost("a.b.vercel.app")).toBe(true);
  });

  it("is false for ordinary domains and look-alikes", () => {
    expect(isSharedHost("acme.com")).toBe(false);
    expect(isSharedHost("mywebflow.io")).toBe(false);
    expect(isSharedHost("")).toBe(false);
  });
});

describe("MULTI_PART_PUBLIC_SUFFIXES", () => {
  // Pinned: an entry that isn't a real public suffix would make the block guard
  // under-refuse. Changing this list needs the tldts check in the verification.
  it("is exactly the reviewed list", () => {
    expect([...MULTI_PART_PUBLIC_SUFFIXES]).toEqual([
      "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk",
      "com.au", "net.au", "org.au", "edu.au", "gov.au",
      "co.nz", "org.nz", "net.nz",
      "co.za",
      "com.br", "com.mx", "com.ar", "com.co",
      "co.jp", "co.in", "co.kr",
      "com.sg", "com.my", "com.hk", "com.tw", "com.cn", "com.tr",
      "co.il", "com.sa", "com.ph", "co.id", "com.pk", "com.ng", "com.eg",
      "co.th", "in.th", "com.vn", "com.ua", "in.ua",
      "com.pe", "com.ec", "com.uy",
      "art.br", "ind.br",
    ]);
  });

  it("does not contain mass.edu", () => {
    expect(MULTI_PART_PUBLIC_SUFFIXES).not.toContain("mass.edu");
  });
});
