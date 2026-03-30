export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { getAccountsList, getDistinctPlans, getDistinctStatuses } from "@/lib/queries/accounts";
import { AccountsTable } from "./_components/accounts-table";

interface AccountsPageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
    plan?: string;
    status?: string;
    sort?: string;
    order?: string;
  }>;
}

export default async function AccountsPage({ searchParams }: AccountsPageProps) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const search = params.search || "";
  const planFilter = params.plan || "";
  const statusFilter = params.status || "";
  const sortBy = params.sort || "created_at";
  const sortOrder = (params.order || "desc") as "asc" | "desc";

  const [{ accounts, totalCount }, plans, statuses] = await Promise.all([
    getAccountsList({ page, search, planFilter, statusFilter, sortBy, sortOrder }),
    getDistinctPlans(),
    getDistinctStatuses(),
  ]);

  return (
    <div>
      <h1 className="text-display-xs font-semibold text-primary">Accounts</h1>
      <p className="mt-1 text-sm text-tertiary">
        Browse and manage all customer accounts.
      </p>

      <div className="mt-6">
        <Suspense fallback={<div className="py-8 text-center text-tertiary">Loading...</div>}>
          <AccountsTable
            accounts={accounts}
            totalCount={totalCount}
            currentPage={page}
            search={search}
            planFilter={planFilter}
            statusFilter={statusFilter}
            sortBy={sortBy}
            sortOrder={sortOrder}
            plans={plans}
            statuses={statuses}
          />
        </Suspense>
      </div>
    </div>
  );
}
