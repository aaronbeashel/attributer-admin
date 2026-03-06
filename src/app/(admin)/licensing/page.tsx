"use client";

import { LicensingUpload } from "./_components/licensing-upload";

export default function LicensingPage() {
  return (
    <div>
      <h1 className="text-display-xs font-semibold text-primary">Licensing</h1>
      <p className="mt-1 text-sm text-tertiary">
        Upload a CSV of domains to check for unlicensed usage. Review and block or dismiss.
      </p>

      <div className="mt-6">
        <LicensingUpload />
      </div>
    </div>
  );
}
