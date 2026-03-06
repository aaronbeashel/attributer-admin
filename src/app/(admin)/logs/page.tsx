import { Suspense } from "react";
import { getEventLogs, getDistinctEventTypes, getDistinctSources } from "@/lib/queries/logs";
import { LogsTable } from "./_components/logs-table";

interface LogsPageProps {
  searchParams: Promise<{
    page?: string;
    type?: string;
    source?: string;
    search?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function LogsPage({ searchParams }: LogsPageProps) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);

  const [{ logs, totalCount }, eventTypes, sources] = await Promise.all([
    getEventLogs({
      page,
      eventType: params.type,
      source: params.source,
      search: params.search,
      dateFrom: params.from,
      dateTo: params.to,
    }),
    getDistinctEventTypes(),
    getDistinctSources(),
  ]);

  return (
    <div>
      <h1 className="text-display-xs font-semibold text-primary">Logs</h1>
      <p className="mt-1 text-sm text-tertiary">
        Global event log and cron job monitor.
      </p>

      <div className="mt-6">
        <Suspense fallback={<div className="py-8 text-center text-tertiary">Loading...</div>}>
          <LogsTable
            logs={logs}
            totalCount={totalCount}
            currentPage={page}
            eventTypes={eventTypes}
            sources={sources}
            filters={{
              type: params.type || "",
              source: params.source || "",
              search: params.search || "",
              from: params.from || "",
              to: params.to || "",
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}
