"use client";

import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { ScanResults } from "./scan-results";
import { BlockedSites } from "./blocked-sites";
import { DomainLookup } from "./domain-lookup";
import { LicensingUpload } from "./licensing-upload";

type Tab = "scan" | "blocked" | "lookup";

export function LicensingDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("scan");
  const [showUpload, setShowUpload] = useState(false);

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-secondary bg-secondary p-1">
        <button
          onClick={() => setActiveTab("scan")}
          className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${
            activeTab === "scan"
              ? "bg-primary text-primary shadow-xs"
              : "text-tertiary hover:text-primary"
          }`}
        >
          Scan Results
        </button>
        <button
          onClick={() => setActiveTab("blocked")}
          className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${
            activeTab === "blocked"
              ? "bg-primary text-primary shadow-xs"
              : "text-tertiary hover:text-primary"
          }`}
        >
          Blocked Sites
        </button>
        <button
          onClick={() => setActiveTab("lookup")}
          className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${
            activeTab === "lookup"
              ? "bg-primary text-primary shadow-xs"
              : "text-tertiary hover:text-primary"
          }`}
        >
          Domain Lookup
        </button>
      </div>

      {/* Active Tab Content */}
      {activeTab === "scan" && <ScanResults />}
      {activeTab === "blocked" && <BlockedSites />}
      {activeTab === "lookup" && <DomainLookup />}

      {/* Manual Upload (collapsible) */}
      <div className="border-t border-secondary pt-6">
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="text-sm font-medium text-tertiary hover:text-primary"
        >
          {showUpload ? "Hide manual upload ▲" : "Manual CSV upload ▼"}
        </button>
        {showUpload && (
          <div className="mt-4">
            <LicensingUpload />
          </div>
        )}
      </div>
    </div>
  );
}
