import Link from "next/link";
import { getDashboardMetrics, getRecentSignups, getRecentCancellations } from "@/lib/queries/dashboard";
import { formatCurrency, formatRelativeTime, formatPercentChange } from "@/lib/utils/format";
import { MetricCard } from "./_components/metric-card";

export default async function DashboardPage() {
  const [metrics, recentSignups, recentCancellations] = await Promise.all([
    getDashboardMetrics(),
    getRecentSignups(8),
    getRecentCancellations(8),
  ]);

  const mrrChange = formatPercentChange(metrics.mrr, metrics.mrrPrevious);
  const customersChange = formatPercentChange(metrics.totalCustomers, metrics.customersPrevious);
  const signupsChange = formatPercentChange(metrics.signupsThisMonth, metrics.signupsPrevious);
  const churnChange = formatPercentChange(metrics.churnThisMonth, metrics.churnPrevious);

  return (
    <div>
      <h1 className="text-display-xs font-semibold text-primary">Dashboard</h1>
      <p className="mt-1 text-sm text-tertiary">
        Key metrics, recent signups, and recent cancellations.
      </p>

      {/* KPI Metrics */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Monthly Recurring Revenue"
          value={formatCurrency(metrics.mrr)}
          change={mrrChange.value}
          changePositive={mrrChange.positive}
        />
        <MetricCard
          label="Active Customers"
          value={metrics.totalCustomers.toLocaleString()}
          change={customersChange.value}
          changePositive={customersChange.positive}
        />
        <MetricCard
          label="Signups This Month"
          value={metrics.signupsThisMonth.toLocaleString()}
          change={signupsChange.value}
          changePositive={signupsChange.positive}
        />
        <MetricCard
          label="Churn This Month"
          value={metrics.churnThisMonth.toLocaleString()}
          change={churnChange.value}
          changePositive={!churnChange.positive}
        />
      </div>

      {/* Recent Activity Feeds */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Signups */}
        <div className="rounded-xl border border-secondary bg-primary">
          <div className="border-b border-secondary px-6 py-4">
            <h2 className="text-lg font-semibold text-primary">Recent Signups</h2>
          </div>
          <div className="divide-y divide-secondary">
            {recentSignups.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-tertiary">No recent signups</p>
            ) : (
              recentSignups.map((account) => (
                <Link
                  key={account.id}
                  href={`/accounts/${account.id}`}
                  className="flex items-center justify-between px-6 py-3 transition-colors hover:bg-primary-hover"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-primary">
                      {account.company || account.name}
                    </p>
                    <p className="truncate text-sm text-tertiary">{account.email}</p>
                  </div>
                  <div className="ml-4 flex shrink-0 flex-col items-end">
                    {account.planName && (
                      <span className="inline-flex items-center rounded-full bg-brand-secondary px-2 py-0.5 text-xs font-medium text-brand-primary">
                        {account.planName}
                      </span>
                    )}
                    <span className="mt-1 text-xs text-quaternary">
                      {formatRelativeTime(account.createdAt)}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent Cancellations */}
        <div className="rounded-xl border border-secondary bg-primary">
          <div className="border-b border-secondary px-6 py-4">
            <h2 className="text-lg font-semibold text-primary">Recent Cancellations</h2>
          </div>
          <div className="divide-y divide-secondary">
            {recentCancellations.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-tertiary">No recent cancellations</p>
            ) : (
              recentCancellations.map((account) => (
                <Link
                  key={account.id}
                  href={`/accounts/${account.id}`}
                  className="flex items-center justify-between px-6 py-3 transition-colors hover:bg-primary-hover"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-primary">
                      {account.company || account.name}
                    </p>
                    <p className="truncate text-sm text-tertiary">{account.email}</p>
                  </div>
                  <div className="ml-4 flex shrink-0 flex-col items-end">
                    {account.planName && (
                      <span className="inline-flex items-center rounded-full bg-error-secondary px-2 py-0.5 text-xs font-medium text-error-primary">
                        {account.planName}
                      </span>
                    )}
                    <span className="mt-1 text-xs text-quaternary">
                      {formatRelativeTime(account.createdAt)}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
