"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { SearchLg, ChevronLeft, ChevronRight } from "@untitledui/icons";
import type { LogEntry } from "@/lib/queries/logs";
import { getEventDescription, getEventTypeColor } from "@/lib/utils/events";
import { formatDateTime } from "@/lib/utils/format";
import { SOURCE_LABELS } from "@/lib/utils/constants";

const PAGE_SIZE = 50;

interface LogsTableProps {
  logs: LogEntry[];
  totalCount: number;
  currentPage: number;
  eventTypes: string[];
  sources: string[];
  filters: {
    type: string;
    source: string;
    search: string;
    from: string;
    to: string;
  };
}

export function LogsTable({
  logs,
  totalCount,
  currentPage,
  eventTypes,
  sources,
  filters,
}: LogsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(filters.search);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      if (!("page" in updates)) params.delete("page");
      router.push(`/logs?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="rounded-xl border border-secondary bg-primary shadow-xs">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 border-b border-secondary px-6 py-4">
        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            updateParams({ search });
          }}
        >
          <Input
            placeholder="Search by account..."
            icon={SearchLg}
            value={search}
            onChange={setSearch}
            className="max-w-sm"
          />
        </form>
        <select
          value={filters.type}
          onChange={(e) => updateParams({ type: e.target.value })}
          className="rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-secondary"
        >
          <option value="">All Types</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={filters.source}
          onChange={(e) => updateParams({ source: e.target.value })}
          className="rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-secondary"
        >
          <option value="">All Sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>{SOURCE_LABELS[s] ?? s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-secondary bg-secondary">
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Timestamp</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Event</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Account</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Source</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-tertiary">
                  No events found.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-secondary">
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-tertiary">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Badge color={getEventTypeColor(log.eventType)} size="sm">
                        {log.eventType}
                      </Badge>
                      <span className="text-sm text-primary">
                        {getEventDescription(log.eventType, log.eventSubtype)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {log.accountId ? (
                      <Link
                        href={`/accounts/${log.accountId}`}
                        className="text-sm text-brand-primary hover:underline"
                      >
                        {log.accountName || log.accountEmail || log.accountId.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="text-sm text-quaternary">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <Badge color="gray" size="sm">
                      {SOURCE_LABELS[log.source] ?? log.source}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    {log.metadata && Object.keys(log.metadata).length > 0 ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-tertiary hover:text-secondary">
                          View
                        </summary>
                        <pre className="mt-1 max-w-md overflow-x-auto rounded bg-secondary p-2 text-xs text-tertiary">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-xs text-quaternary">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-secondary px-6 py-4">
          <p className="text-sm text-tertiary">
            Page {currentPage} of {totalPages} ({totalCount} events)
          </p>
          <div className="flex items-center gap-2">
            <Button
              color="secondary"
              size="sm"
              isDisabled={currentPage <= 1}
              onClick={() => updateParams({ page: String(currentPage - 1) })}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              color="secondary"
              size="sm"
              isDisabled={currentPage >= totalPages}
              onClick={() => updateParams({ page: String(currentPage + 1) })}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
