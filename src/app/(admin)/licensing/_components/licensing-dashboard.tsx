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
      <div className="flex items-center gap-1 rounded-lg border border-secondary bg-secondary p-1">
        <button
          onClick={() => setActiveTab("scan")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "scan"
              ? "bg-primary text-primary shadow-xs"
              : "text-tertiary hover:text-primary"
          }`}
        >
          Scan Results
        </button>
        <button
          onClick={() => setActiveTab("blocked")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "blocked"
              ? "bg-primary text-primary shadow-xs"
              : "text-tertiary hover:text-primary"
          }`}
        >
          Blocked Sites
        </button>
        <button
          onClick={() => setActiveTab("lookup")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
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
