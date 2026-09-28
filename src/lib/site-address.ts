import { isValidDomain, rootFamily } from "@/lib/licensing/domain-match";

// Parses a website address the way the customer app saves it
// (attributer-app/src/lib/domain.ts normalizeDomain), so an admin edit stores
// the same domain the customer app would. Pure: the edit window and the save
// route both use it.

export type ParsedAddress = { ok: true; websiteUrl: string; domain: string } | { ok: false; error: string };

const MAX_URL_LENGTH = 2048;
const MAX_HOSTNAME_LENGTH = 253;
const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;
const INVALID: ParsedAddress = { ok: false, error: "That isn't a valid website address." };

export function parseWebsiteAddress(input: string): ParsedAddress {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return { ok: false, error: "Enter a website address." };

  const websiteUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (websiteUrl.length > MAX_URL_LENGTH) return INVALID;

  let url: URL;
  try {
    url = new URL(websiteUrl);
  } catch {
    return INVALID;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return INVALID;

  const hostname = url.hostname.toLowerCase();
  const domain = hostname.startsWith("www.") ? hostname.slice(4) : hostname;

  if (
    hostname.length > MAX_HOSTNAME_LENGTH ||
    hostname.startsWith("[") ||
    IPV4_PATTERN.test(domain) ||
    !isValidDomain(domain) ||
    rootFamily(domain).length === 0
  ) {
    return INVALID;
  }

  return { ok: true, websiteUrl, domain };
}
