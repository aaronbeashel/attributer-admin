"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { SearchLg, ChevronLeft, ChevronRight } from "@untitledui/icons";
import type { LogEntry } from "@/lib/queries/logs";
import { getEventDescription, getEventTypeColor } from "@/lib/utils/events";
import { formatDateTime } from "@/lib/utils/format";
import { EVENT_TYPE_LABELS, SOURCE_LABELS } from "@/lib/utils/constants";

const PAGE_SIZE = 50;

interface LogsTableProps {
  logs: LogEntry[];
  totalCount: number;
  currentPage: number;
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
      <div className="flex flex-col gap-3 border-b border-secondary px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-6 sm:py-4">
        <form
          className="w-full sm:flex-1"
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
            className="sm:max-w-sm"
          />
        </form>
        <div className="flex gap-3">
          <Select
            size="sm"
            placeholder="All Types"
            selectedKey={filters.type || null}
            onSelectionChange={(key) => updateParams({ type: key === null ? "" : String(key) })}
            className="w-44"
          >
            <Select.Item id="" label="All Types" />
            {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
              <Select.Item key={value} id={value} label={label} />
            ))}
          </Select>
          <Select
            size="sm"
            placeholder="All Sources"
            selectedKey={filters.source || null}
            onSelectionChange={(key) => updateParams({ source: key === null ? "" : String(key) })}
            className="w-44"
          >
            <Select.Item id="" label="All Sources" />
            {Object.entries(SOURCE_LABELS).map(([value, label]) => (
              <Select.Item key={value} id={value} label={label} />
            ))}
          </Select>
        </div>
      </div>

      {/* Mobile Card List */}
      <div className="divide-y divide-secondary sm:hidden">
        {logs.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-tertiary">No events found.</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge color={getEventTypeColor(log.eventType)} size="sm">
                      {log.eventType}
                    </Badge>
                    <Badge color="gray" size="sm">
                      {SOURCE_LABELS[log.source] ?? log.source}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-primary">
                    {getEventDescription(log.eventType, log.eventSubtype)}
                  </p>
                  {log.accountId && (
                    <Link
                      href={`/accounts/${log.accountId}`}
                      className="mt-0.5 block text-sm text-brand-primary hover:underline"
                    >
                      {log.accountName || log.accountEmail || log.accountId.slice(0, 8)}
                    </Link>
                  )}
                </div>
                <span className="shrink-0 text-xs text-quaternary">
                  {formatDateTime(log.createdAt)}
                </span>
              </div>
              {log.metadata && Object.keys(log.metadata).length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-tertiary hover:text-secondary">
                    View details
                  </summary>
                  <pre className="mt-1 max-w-full overflow-x-auto rounded bg-secondary p-2 text-xs break-all text-tertiary">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden overflow-x-auto sm:block">
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
        <div className="flex flex-col items-center gap-3 border-t border-secondary px-4 py-3 sm:flex-row sm:justify-between sm:px-6 sm:py-4">
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
