import { createSupabaseAdminClient } from "@/lib/supabase/admin";

interface LogEventParams {
  accountId: string;
  eventType: string;
  eventSubtype?: string;
  metadata?: Record<string, unknown>;
  source: string;
}

export async function logEvent(params: LogEventParams): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.from("event_log").insert({
    account_id: params.accountId,
    event_type: params.eventType,
    event_subtype: params.eventSubtype ?? null,
    metadata: params.metadata ?? null,
    source: params.source,
  });

  if (error) {
    console.error("[logEvent] Failed to log event:", error);
  }
}
