import { ArrowUp, ArrowDown } from "@untitledui/icons";

interface MetricCardProps {
  label: string;
  value: string;
  change?: string;
  changePositive?: boolean;
}

export function MetricCard({ label, value, change, changePositive }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-secondary bg-primary p-4 sm:p-6">
      <p className="text-sm font-medium text-tertiary">{label}</p>
      <p className="mt-2 text-display-sm font-semibold text-primary">{value}</p>
      {change && (
        <div className="mt-2 flex items-center gap-1">
          {changePositive ? (
            <ArrowUp className="h-4 w-4 text-success-primary" />
          ) : (
            <ArrowDown className="h-4 w-4 text-error-primary" />
          )}
          <span
            className={`text-sm font-medium ${
              changePositive ? "text-success-primary" : "text-error-primary"
            }`}
          >
            {change}
          </span>
          <span className="text-sm text-tertiary">vs last month</span>
        </div>
      )}
    </div>
  );
}
