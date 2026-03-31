import { Badge } from "@/components/base/badges/badges";
import type { AccountEnrichment } from "@/lib/queries/account-detail";
import { formatDate } from "@/lib/utils/format";
import { EnrichButton } from "./enrich-button";

interface EnrichmentSectionProps {
  accountId: string;
  enrichment: AccountEnrichment | null;
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

export function EnrichmentSection({ accountId, enrichment }: EnrichmentSectionProps) {
  const hasEnrichment = enrichment?.industry || enrichment?.companySize || enrichment?.signupPath;

  return (
    <div className="rounded-xl border border-secondary bg-primary">
      <div className="border-b border-secondary px-6 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary">AI Enrichment</h2>
          <div className="flex items-center gap-3">
            {enrichment?.enrichedAt && (
              <span className="text-xs text-quaternary">
                Last enriched {formatDate(enrichment.enrichedAt)}
              </span>
            )}
            <EnrichButton accountId={accountId} hasEnrichment={!!hasEnrichment} />
          </div>
        </div>
      </div>
      {hasEnrichment ? (
        <div className="grid grid-cols-2 gap-6 px-6 py-5 lg:grid-cols-3">
          <Field label="Industry" value={enrichment!.industry} confidence={enrichment!.confidenceIndustry} />
          {enrichment!.subIndustry && (
            <Field label="Sub-Industry" value={enrichment!.subIndustry} />
          )}
          <Field label="Company Size" value={enrichment!.companySize} confidence={enrichment!.confidenceSize} />
          <Field label="Signup Path" value={enrichment!.signupPath} confidence={enrichment!.confidencePath} />
          {enrichment!.jobTitle && (
            <Field label="Job Title" value={enrichment!.jobTitle} />
          )}
          {enrichment!.jobDescription && (
            <div className="col-span-2">
              <dt className="text-sm text-tertiary">Job Description</dt>
              <dd className="mt-1 text-sm font-medium text-primary">{enrichment!.jobDescription}</dd>
            </div>
          )}
        </div>
      ) : (
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-tertiary">No enrichment data available</p>
        </div>
      )}
    </div>
  );
}
