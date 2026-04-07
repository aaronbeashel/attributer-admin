"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { SearchLg, ChevronLeft, ChevronRight } from "@untitledui/icons";
import type { AccountListItem } from "@/lib/queries/accounts";
import { formatDate, formatCurrency } from "@/lib/utils/format";
import { STATUS_COLORS } from "@/lib/utils/constants";

interface AccountsTableProps {
  accounts: AccountListItem[];
  totalCount: number;
  currentPage: number;
  search: string;
  planFilter: string;
  statusFilter: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  plans: string[];
  statuses: string[];
}

const PAGE_SIZE = 25;

export function AccountsTable({
  accounts,
  totalCount,
  currentPage,
  search: initialSearch,
  planFilter,
  statusFilter,
  sortBy,
  sortOrder,
  plans,
  statuses,
}: AccountsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      // Reset to page 1 on filter change
      if (!("page" in updates)) {
        params.delete("page");
      }
      router.push(`/accounts?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleSearch = useCallback(() => {
    updateParams({ search });
  }, [search, updateParams]);

  const handleSort = useCallback(
    (column: string) => {
      const newOrder = sortBy === column && sortOrder === "asc" ? "desc" : "asc";
      updateParams({ sort: column, order: newOrder });
    },
    [sortBy, sortOrder, updateParams]
  );

  return (
    <div className="rounded-xl border border-secondary bg-primary shadow-xs">
      {/* Filters Bar */}
      <div className="flex flex-col gap-3 border-b border-secondary px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-6 sm:py-4">
        <div className="w-full sm:flex-1">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
          >
            <Input
              placeholder="Search accounts..."
              icon={SearchLg}
              value={search}
              onChange={setSearch}
              className="sm:max-w-sm"
            />
          </form>
        </div>
        <div className="flex gap-3">
          <select
            value={planFilter}
            onChange={(e) => updateParams({ plan: e.target.value })}
            className="flex-1 rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-secondary sm:flex-none"
          >
            <option value="">All Plans</option>
            {plans.map((plan) => (
              <option key={plan} value={plan}>
                {plan}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => updateParams({ status: e.target.value })}
            className="flex-1 rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-secondary sm:flex-none"
          >
            <option value="">All Statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Mobile Card List */}
      <div className="divide-y divide-secondary sm:hidden">
        {accounts.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-tertiary">No accounts found.</p>
        ) : (
          accounts.map((account) => (
            <Link
              key={account.id}
              href={`/accounts/${account.id}`}
              className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-secondary active:bg-secondary"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-primary">
                  {account.company || account.name}
                </p>
                <p className="mt-0.5 truncate text-sm text-tertiary">{account.email}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {account.planName && (
                    <Badge color="brand" size="sm">
                      {account.planName}
                    </Badge>
                  )}
                  {account.subscriptionStatus && (
                    <Badge
                      color={STATUS_COLORS[account.subscriptionStatus] ?? "gray"}
                      size="sm"
                    >
                      {account.subscriptionStatus.charAt(0).toUpperCase() +
                        account.subscriptionStatus.slice(1)}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="ml-3 shrink-0 text-right">
                <p className="text-sm font-medium text-primary">
                  {account.planPriceCents ? formatCurrency(account.planPriceCents) : "—"}
                </p>
                <p className="mt-0.5 text-xs text-quaternary">
                  {formatDate(account.createdAt)}
                </p>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-secondary bg-secondary">
              <SortableHeader
                column="company"
                label="Company"
                currentSort={sortBy}
                currentOrder={sortOrder}
                onSort={handleSort}
              />
              <SortableHeader
                column="email"
                label="Email"
                currentSort={sortBy}
                currentOrder={sortOrder}
                onSort={handleSort}
              />
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Plan</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Status</th>
              <SortableHeader
                column="created_at"
                label="Signup Date"
                currentSort={sortBy}
                currentOrder={sortOrder}
                onSort={handleSort}
              />
              <th className="px-6 py-3 text-right text-xs font-semibold text-quaternary">MRR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-tertiary">
                  No accounts found.
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr
                  key={account.id}
                  className="cursor-pointer transition-colors hover:bg-secondary"
                  onClick={() => router.push(`/accounts/${account.id}`)}
                >
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-primary">
                        {account.company || account.name}
                      </p>
                      {account.company && (
                        <p className="text-sm text-tertiary">{account.name}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-tertiary">{account.email}</td>
                  <td className="px-6 py-4">
                    {account.planName ? (
                      <Badge color="brand" size="sm">
                        {account.planName}
                      </Badge>
                    ) : (
                      <span className="text-sm text-quaternary">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {account.subscriptionStatus ? (
                      <Badge
                        color={STATUS_COLORS[account.subscriptionStatus] ?? "gray"}
                        size="sm"
                      >
                        {account.subscriptionStatus.charAt(0).toUpperCase() +
                          account.subscriptionStatus.slice(1)}
                      </Badge>
                    ) : (
                      <span className="text-sm text-quaternary">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-tertiary">
                    {formatDate(account.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-tertiary">
                    {account.planPriceCents
                      ? formatCurrency(account.planPriceCents)
                      : "—"}
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
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount}
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

function SortableHeader({
  column,
  label,
  currentSort,
  currentOrder,
  onSort,
}: {
  column: string;
  label: string;
  currentSort: string;
  currentOrder: string;
  onSort: (column: string) => void;
}) {
  const isActive = currentSort === column;
  return (
    <th
      className="cursor-pointer px-6 py-3 text-left text-xs font-semibold text-quaternary hover:text-tertiary"
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          <span className="text-[10px]">{currentOrder === "asc" ? "▲" : "▼"}</span>
        )}
      </span>
    </th>
  );
}
