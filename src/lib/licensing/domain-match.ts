import { normalizeDomain } from "@/lib/licensing/normalize";

// Hosts where many unrelated customers share one registrable root. The licensing
// server blocks by root, so blocking one of these switches off every customer on
// that host. This file is the canonical list.
export const SHARED_HOST_ROOTS: readonly string[] = [
  "webflow.io",
  "wpengine.com",
  "wpenginepowered.com",
  "vercel.app",
  "squarespace.com",
  "framer.app",
  "framer.website",
  "pantheonsite.io",
  "hostingersite.com",
  "amplifyapp.com",
  "ubpages.com",
  "onrocket.site",
  "netlify.app",
  "herokuapp.com",
  "github.io",
  "pages.dev",
  "web.app",
  "firebaseapp.com",
  "wixsite.com",
  "myshopify.com",
  "azurewebsites.net",
  "cloudfront.net",
  "hs-sites.com",
  "hubspotpagebuilder.com",
  "godaddysites.com",
  "weebly.com",
  "carrd.co",
];

// Public suffixes with more than one label. Every entry must be a genuine ICANN
// public suffix: a missing entry makes the block guard over-refuse (safe), a
// wrong entry makes it under-refuse (unsafe).
export const MULTI_PART_PUBLIC_SUFFIXES: readonly string[] = [
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
];

const MULTI_PART_SET = new Set(MULTI_PART_PUBLIC_SUFFIXES);

const DOMAIN_PATTERN = /^[a-z0-9.-]+$/;

/** Lowercase letters, digits, dots and hyphens, at least two labels, none empty. Expects a normalised domain. */
export function isValidDomain(domain: string): boolean {
  if (!domain || !DOMAIN_PATTERN.test(domain)) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((label) => label.length > 0);
}

export function isSharedHost(domain: string): boolean {
  const d = normalizeDomain(domain);
  if (!d) return false;
  return SHARED_HOST_ROOTS.some((root) => d === root || d.endsWith("." + root));
}

/** Proper parent domains with at least two labels: "a.b.example.com" -> ["b.example.com", "example.com"]. */
export function domainSuffixes(domain: string): string[] {
  const d = normalizeDomain(domain);
  if (!d) return [];
  const labels = d.split(".");
  const out: string[] = [];
  for (let i = 1; i <= labels.length - 2; i++) {
    out.push(labels.slice(i).join("."));
  }
  return out;
}

/**
 * The domain plus its parents, minus bare public suffixes. Blocking any member
 * takes out the whole registrable root on the licensing server, so the block
 * guard checks every site related to any of these.
 */
export function rootFamily(domain: string): string[] {
  const d = normalizeDomain(domain);
  if (!d) return [];
  return [d, ...domainSuffixes(d)].filter((x) => !MULTI_PART_SET.has(x));
}

/** Last two labels, or last three when the last two are a listed public suffix. */
export function registrableRoot(domain: string): string {
  const d = normalizeDomain(domain);
  const labels = d.split(".");
  if (labels.length <= 2) return d;
  const lastTwo = labels.slice(-2).join(".");
  return MULTI_PART_SET.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

/** One label, or a bare multi-part public suffix: never a real site or report domain. */
function isBareSuffix(domain: string): boolean {
  return !domain.includes(".") || MULTI_PART_SET.has(domain);
}

/**
 * Report domain D and site domain S are related when D equals S, or one is a
 * subdomain of the other. Shared hosts, one-label domains and bare public
 * suffixes never relate to anything, on either side.
 */
export function isRelated(reportDomain: string, siteDomain: string): boolean {
  const d = normalizeDomain(reportDomain);
  const s = normalizeDomain(siteDomain);
  if (!d || !s) return false;
  if (isSharedHost(d) || isSharedHost(s)) return false;
  if (isBareSuffix(d) || isBareSuffix(s)) return false;
  return d === s || s.endsWith("." + d) || d.endsWith("." + s);
}
