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

function LinkField({ label, url }: { label: string; url: string | null }) {
  return (
    <div>
      <dt className="text-sm text-tertiary">{label}</dt>
      <dd className="mt-1">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand hover:underline">
            {url}
          </a>
        ) : (
          <span className="text-sm font-medium text-primary">—</span>
        )}
      </dd>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <h3 className="col-span-full text-sm font-semibold text-secondary uppercase tracking-wide">{title}</h3>;
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
          {/* Company Classification */}
          <SectionHeader title="Company" />
          <Field label="Industry" value={enrichment!.industry} confidence={enrichment!.confidenceIndustry} />
          {enrichment!.subIndustry && (
            <Field label="Sub-Industry" value={enrichment!.subIndustry} />
          )}
          <Field label="Company Size" value={enrichment!.companySize} confidence={enrichment!.confidenceSize} />
          {enrichment!.employeeCount !== null && (
            <Field label="Employee Count" value={String(enrichment!.employeeCount)} />
          )}
          <Field label="Signup Path" value={enrichment!.signupPath} confidence={enrichment!.confidencePath} />
          {enrichment!.companyDescription && (
            <div className="col-span-2">
              <dt className="text-sm text-tertiary">Company Description</dt>
              <dd className="mt-1 text-sm font-medium text-primary">{enrichment!.companyDescription}</dd>
            </div>
          )}
          {enrichment!.companyLinkedinUrl && (
            <LinkField label="Company LinkedIn" url={enrichment!.companyLinkedinUrl} />
          )}

          {/* Person Information */}
          {(enrichment!.jobTitleRaw || enrichment!.jobRole || enrichment!.personDescription) && (
            <>
              <SectionHeader title="Person" />
              {enrichment!.jobTitleRaw && (
                <Field label="Job Title" value={enrichment!.jobTitleRaw} confidence={enrichment!.confidencePerson} />
              )}
              {enrichment!.jobRole && (
                <Field label="Job Role" value={enrichment!.jobRole} />
              )}
              {enrichment!.seniorityLevel && (
                <Field label="Seniority" value={enrichment!.seniorityLevel} />
              )}
              {enrichment!.personLocation && (
                <Field label="Location" value={enrichment!.personLocation} />
              )}
              {enrichment!.yearsExperience !== null && (
                <Field label="Years Experience" value={String(enrichment!.yearsExperience)} />
              )}
              {enrichment!.personLinkedinUrl && (
                <LinkField label="Person LinkedIn" url={enrichment!.personLinkedinUrl} />
              )}
              {enrichment!.personDescription && (
                <div className="col-span-2">
                  <dt className="text-sm text-tertiary">Person Description</dt>
                  <dd className="mt-1 text-sm font-medium text-primary">{enrichment!.personDescription}</dd>
                </div>
              )}
            </>
          )}

          {/* Signup Analysis */}
          {(enrichment!.emailDomain || enrichment!.domainsMatch !== null) && (
            <>
              <SectionHeader title="Signup Analysis" />
              {enrichment!.emailDomain && (
                <Field label="Email Domain" value={enrichment!.emailDomain} />
              )}
              {enrichment!.domainsMatch !== null && (
                <Field
                  label="Domains Match"
                  value={enrichment!.domainsMatch ? "Yes" : "No"}
                />
              )}
            </>
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
