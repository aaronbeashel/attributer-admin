import { getSnapshotMetrics } from "@/lib/queries/analytics-snapshot";
import { formatCurrency, formatNumber, formatPercentChange } from "@/lib/utils/format";
import { MetricCard } from "../../_components/metric-card";

export default async function SnapshotPage() {
  const metrics = await getSnapshotMetrics();

  return (
    <div>
      <h1 className="text-display-xs font-semibold text-primary">
        Analytics — Snapshot
      </h1>
      <p className="mt-1 text-sm text-tertiary">
        Current month vs previous month performance metrics.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => {
          const change = formatPercentChange(metric.current, metric.previous);
          let displayValue: string;

          switch (metric.format) {
            case "currency":
              displayValue = formatCurrency(metric.current);
              break;
            case "percent":
              displayValue = `${metric.current.toFixed(1)}%`;
              break;
            default:
              displayValue = formatNumber(metric.current);
          }

          // For cancellations, positive change is bad
          const isPositiveGood = metric.label !== "Cancellations";

          return (
            <MetricCard
              key={metric.label}
              label={metric.label}
              value={displayValue}
              change={change.value}
              changePositive={isPositiveGood ? change.positive : !change.positive}
            />
          );
        })}
      </div>
    </div>
  );
}
