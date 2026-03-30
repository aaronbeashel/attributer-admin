import { Badge } from "@/components/base/badges/badges";
import type { AccountDetail } from "@/lib/queries/account-detail";
import { formatDate } from "@/lib/utils/format";
import { EnrichButton } from "./enrich-button";

interface EnrichmentSectionProps {
  account: AccountDetail;
}

function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence === null) return <span className="text-sm text-quaternary">—</span>;
  const color = confidence >= 80 ? "success" : confidence >= 50 ? "warning" : "error";
  return (
    <Badge color={color} size="sm">
      {confidence}%
    </Badge>
  );
}

function Field({ label, value, confidence }: { label: string; value: string | null; confidence?: number | null }) {
  return (
    <div>
      <dt className="text-sm text-tertiary">{label}</dt>
      <dd className="mt-1 flex items-center gap-2">
        <span className="text-sm font-medium text-primary">{value || "—"}</span>
        {confidence !== undefined && <ConfidenceBadge confidence={confidence} />}
      </dd>
    </div>
  );
}

export function EnrichmentSection({ account }: EnrichmentSectionProps) {
  const hasEnrichment = account.aiIndustry || account.aiCompanySize || account.aiSignupPath;

  return (
    <div className="rounded-xl border border-secondary bg-primary">
      <div className="border-b border-secondary px-6 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary">AI Enrichment</h2>
          <div className="flex items-center gap-3">
            {account.aiEnrichedAt && (
              <span className="text-xs text-quaternary">
                Last enriched {formatDate(account.aiEnrichedAt)}
              </span>
            )}
            <EnrichButton accountId={account.id} hasEnrichment={!!hasEnrichment} />
          </div>
        </div>
      </div>
      {hasEnrichment ? (
        <div className="grid grid-cols-2 gap-6 px-6 py-5 lg:grid-cols-3">
          <Field label="Industry" value={account.aiIndustry} confidence={account.aiConfidenceIndustry} />
          <Field label="Company Size" value={account.aiCompanySize} confidence={account.aiConfidenceSize} />
          <Field label="Signup Path" value={account.aiSignupPath} confidence={account.aiConfidencePath} />
        </div>
      ) : (
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-tertiary">No enrichment data available</p>
        </div>
      )}
    </div>
  );
}
