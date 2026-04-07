import type { AccountDetail } from "@/lib/queries/account-detail";

interface AttributionSectionProps {
  account: AccountDetail;
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-sm text-tertiary">{label}</dt>
      <dd className="mt-1 break-all text-sm font-medium text-primary">{value ?? "—"}</dd>
    </div>
  );
}

export function AttributionSection({ account }: AttributionSectionProps) {
  const hasAttribution = account.attrChannel;

  return (
    <div className="rounded-xl border border-secondary bg-primary">
      <div className="border-b border-secondary px-4 py-3 sm:px-6 sm:py-4">
        <h2 className="text-lg font-semibold text-primary">Attribution</h2>
      </div>
      {hasAttribution ? (
        <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 sm:gap-6 sm:px-6 sm:py-5 lg:grid-cols-3">
          <Field label="Channel" value={account.attrChannel} />
          <Field label="Drilldown 1" value={account.attrChannelDrilldown1} />
          <Field label="Drilldown 2" value={account.attrChannelDrilldown2} />
          <Field label="Drilldown 3" value={account.attrChannelDrilldown3} />
          <Field label="Drilldown 4" value={account.attrChannelDrilldown4} />
          <Field label="Landing Page" value={account.attrLandingPage} />
          <Field label="Landing Page Group" value={account.attrLandingPageGroup} />
          <Field label="Number of Visits" value={account.attrNumVisits} />
          <Field label="Time to Conversion" value={account.attrTimeToConversion} />
        </div>
      ) : (
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-tertiary">No attribution data available</p>
        </div>
      )}
    </div>
  );
}
