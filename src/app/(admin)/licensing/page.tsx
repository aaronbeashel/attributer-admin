export const dynamic = "force-dynamic";

import { LicensingDashboard } from "./_components/licensing-dashboard";

export default function LicensingPage() {
  return (
    <div>
      <h1 className="text-display-xs font-semibold text-primary">Licensing</h1>
      <p className="mt-1 text-sm text-tertiary">
        Monitor unlicensed script usage, manage blocked domains, and look up any domain.
      </p>

      <div className="mt-6">
        <LicensingDashboard />
      </div>
    </div>
  );
}
