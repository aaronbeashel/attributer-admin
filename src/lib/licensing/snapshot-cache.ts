import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSnapshot, type LicensingSnapshot } from "@/lib/licensing/entitlement";

// The review hints on Scan Results need a full snapshot of who pays. Loading it
// takes a few seconds, so it's shared for 5 minutes. The in-flight promise is
// cached, so the page's two parallel requests share one load. A failed load is
// dropped straight away so the next request tries again.

const TTL_MS = 5 * 60 * 1000;

let cached: { loadedAt: number; snapshot: Promise<LicensingSnapshot> } | null = null;

export function getHintSnapshot(supabase: SupabaseClient): Promise<LicensingSnapshot> {
  const now = Date.now();
  if (cached && now - cached.loadedAt < TTL_MS) return cached.snapshot;

  const entry = { loadedAt: now, snapshot: loadSnapshot(supabase) };
  cached = entry;
  entry.snapshot.catch(() => {
    if (cached === entry) cached = null;
  });
  return entry.snapshot;
}
