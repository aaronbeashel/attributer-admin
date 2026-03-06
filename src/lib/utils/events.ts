import { EVENT_TYPES } from "./constants";

type EventTypeEntry = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

const eventLookup = new Map<string, EventTypeEntry>();
for (const entry of Object.values(EVENT_TYPES)) {
  eventLookup.set(`${entry.type}:${entry.subtype}`, entry);
}

export function getEventDescription(eventType: string, eventSubtype?: string | null): string {
  const key = `${eventType}:${eventSubtype ?? ""}`;
  const entry = eventLookup.get(key);
  if (entry) return entry.label;

  // Fallback: capitalize and humanize
  const parts = [eventType, eventSubtype].filter(Boolean);
  return parts
    .join(" ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getEventTypeColor(eventType: string): "success" | "warning" | "error" | "gray" | "brand" {
  switch (eventType) {
    case "account":
      return "brand";
    case "auth":
      return "gray";
    case "subscription":
      return "success";
    case "site":
      return "gray";
    case "admin":
      return "warning";
    case "cron":
      return "gray";
    default:
      return "gray";
  }
}
