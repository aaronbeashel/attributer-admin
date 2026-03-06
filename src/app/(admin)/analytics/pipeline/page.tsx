import Link from "next/link";
import { Badge } from "@/components/base/badges/badges";
import { getPipelineMetrics, getActiveTrials } from "@/lib/queries/analytics-pipeline";
import { formatDate } from "@/lib/utils/format";
import { MetricCard } from "../../_components/metric-card";

export default async function PipelinePage() {
  const [pipeline, trials] = await Promise.all([
    getPipelineMetrics(),
    getActiveTrials(),
  ]);

  return (
    <div>
      <h1 className="text-display-xs font-semibold text-primary">
        Analytics — Pipeline
      </h1>
      <p className="mt-1 text-sm text-tertiary">
        Carded and cardless trial pipeline with estimated conversions.
      </p>

      {/* Pipeline Metrics */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Total Pipeline"
          value={pipeline.totalPipeline.toString()}
        />
        <MetricCard
          label="Carded Trials"
          value={pipeline.cardedTrials.toString()}
        />
        <MetricCard
          label="Cardless Trials"
          value={`${pipeline.cardlessTrials} (est. ${pipeline.estimatedCardlessConversions} conversions)`}
        />
      </div>

      {/* Active Trials Table */}
      <div className="mt-8 rounded-xl border border-secondary bg-primary shadow-xs">
        <div className="border-b border-secondary px-6 py-4">
          <h2 className="text-lg font-semibold text-primary">Active Trials</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-secondary bg-secondary">
                <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Account</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Email</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Trial Type</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Ends</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Days Left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary">
              {trials.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-tertiary">
                    No active trials.
                  </td>
                </tr>
              ) : (
                trials.map((trial) => (
                  <tr key={trial.id} className="hover:bg-secondary">
                    <td className="px-6 py-4">
                      <Link
                        href={`/accounts/${trial.id}`}
                        className="text-sm font-medium text-brand-primary hover:underline"
                      >
                        {trial.company || trial.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-tertiary">{trial.email}</td>
                    <td className="px-6 py-4">
                      <Badge color="brand" size="sm">{trial.planName}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        color={trial.trialType === "carded" ? "success" : "warning"}
                        size="sm"
                      >
                        {trial.trialType || "Standard"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-tertiary">
                      {formatDate(trial.trialEndsAt)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-sm font-medium ${
                          trial.daysRemaining <= 3
                            ? "text-error-primary"
                            : trial.daysRemaining <= 7
                              ? "text-warning-primary"
                              : "text-primary"
                        }`}
                      >
                        {trial.daysRemaining}d
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
