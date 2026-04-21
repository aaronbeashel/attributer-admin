import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface LogEntry {
  id: string;
  accountId: string | null;
  eventType: string;
  eventSubtype: string | null;
  metadata: Record<string, unknown> | null;
  source: string;
  createdAt: string;
  accountName?: string;
  accountEmail?: string;
}

export interface LogsResult {
  logs: LogEntry[];
  totalCount: number;
}

export interface LogsParams {
  page?: number;
  pageSize?: number;
  eventType?: string;
  source?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function getEventLogs(params: LogsParams = {}): Promise<LogsResult> {
  const {
    page = 1,
    pageSize = 50,
    eventType,
    source,
    search,
    dateFrom,
    dateTo,
  } = params;

  const supabase = createSupabaseAdminClient();
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("event_log")
    .select("*, accounts(name, email)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (eventType) {
    query = query.eq("event_type", eventType);
  }
  if (source) {
    query = query.eq("source", source);
  }
  if (dateFrom) {
    query = query.gte("created_at", dateFrom);
  }
  if (dateTo) {
    query = query.lte("created_at", dateTo);
  }

  const { data, count } = await query;

  let logs: LogEntry[] = (data ?? []).map((e) => {
    const acct = e.accounts as { name: string; email: string } | null;
    return {
      id: e.id,
      accountId: e.account_id,
      eventType: e.event_type,
      eventSubtype: e.event_subtype,
      metadata: e.metadata as Record<string, unknown> | null,
      source: e.source,
      createdAt: e.created_at,
      accountName: acct?.name,
      accountEmail: acct?.email,
    };
  });

  // Client-side search filter for account name/email
  if (search) {
    const q = search.toLowerCase();
    logs = logs.filter(
      (l) =>
        l.accountName?.toLowerCase().includes(q) ||
        l.accountEmail?.toLowerCase().includes(q)
    );
  }

  return { logs, totalCount: count ?? 0 };
}

