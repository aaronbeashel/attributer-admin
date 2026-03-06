"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { UploadCloud01 } from "@untitledui/icons";

interface PipelineResult {
  domain: string;
  callCount: number;
  isLicensed: boolean;
  isBlocked: boolean;
  scriptFound: boolean;
  priorReview: { action: string; actionedAt: string } | null;
  accountContext: { id: string; name: string; email: string } | null;
}

interface ProcessingResponse {
  totalRows: number;
  uniqueDomains: number;
  unlicensedResults: number;
  results: PipelineResult[];
}

export function LicensingUpload() {
  const [results, setResults] = useState<PipelineResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [stats, setStats] = useState<{ totalRows: number; uniqueDomains: number; unlicensed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minCallCount, setMinCallCount] = useState(50);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    setProcessing(true);
    setError(null);
    setResults([]);
    setStats(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/licensing/process", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Processing failed");
      }

      const data: ProcessingResponse = await res.json();
      setResults(data.results);
      setStats({
        totalRows: data.totalRows,
        uniqueDomains: data.uniqueDomains,
        unlicensed: data.unlicensedResults,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setProcessing(false);
    }
  }, []);

  const handleAction = useCallback(async (domain: string, action: "blocked" | "dismissed", reason?: string, notes?: string) => {
    try {
      const res = await fetch("/api/licensing/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, action, reason, notes }),
      });

      if (res.ok) {
        setResults((prev) =>
          prev.map((r) =>
            r.domain === domain
              ? { ...r, priorReview: { action, actionedAt: new Date().toISOString() } }
              : r
          )
        );
      }
    } catch {
      // Ignore action errors silently
    }
  }, []);

  const filteredResults = results.filter((r) => r.callCount >= minCallCount && !r.isBlocked);

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <div
        className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-secondary bg-primary px-6 py-12 text-center transition-colors hover:border-brand-primary"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file && file.name.endsWith(".csv")) handleUpload(file);
        }}
      >
        <UploadCloud01 className="mb-3 h-10 w-10 text-quaternary" />
        <p className="text-sm font-medium text-primary">
          Drag & drop a CSV file, or{" "}
          <button
            className="text-brand-primary hover:underline"
            onClick={() => fileInputRef.current?.click()}
          >
            browse
          </button>
        </p>
        <p className="mt-1 text-xs text-tertiary">CSV files only</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
        />
      </div>

      {processing && (
        <div className="rounded-xl border border-secondary bg-primary px-6 py-8 text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-brand-primary" />
          <p className="text-sm font-medium text-primary">Processing CSV...</p>
          <p className="mt-1 text-xs text-tertiary">Running licensing pipeline</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-error-secondary bg-error-secondary p-4 text-sm text-error-primary">
          {error}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-secondary bg-primary px-4 py-3 text-center">
            <p className="text-2xl font-semibold text-primary">{stats.totalRows}</p>
            <p className="text-xs text-tertiary">Total Rows</p>
          </div>
          <div className="rounded-xl border border-secondary bg-primary px-4 py-3 text-center">
            <p className="text-2xl font-semibold text-primary">{stats.uniqueDomains}</p>
            <p className="text-xs text-tertiary">Unique Domains</p>
          </div>
          <div className="rounded-xl border border-secondary bg-primary px-4 py-3 text-center">
            <p className="text-2xl font-semibold text-primary">{stats.unlicensed}</p>
            <p className="text-xs text-tertiary">Unlicensed</p>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="rounded-xl border border-secondary bg-primary shadow-xs">
          {/* Filters */}
          <div className="flex items-center gap-4 border-b border-secondary px-6 py-4">
            <label className="flex items-center gap-2 text-sm text-tertiary">
              Min calls:
              <input
                type="number"
                value={minCallCount}
                onChange={(e) => setMinCallCount(parseInt(e.target.value, 10) || 0)}
                className="w-20 rounded-lg border border-secondary bg-primary px-2 py-1 text-sm text-primary"
              />
            </label>
            <span className="text-sm text-tertiary">
              Showing {filteredResults.length} of {results.length} results
            </span>
          </div>

          {/* Results Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-secondary bg-secondary">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Domain</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Calls</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Script</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Account</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Prior Review</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary">
                {filteredResults.map((result) => (
                  <tr key={result.domain} className="hover:bg-secondary">
                    <td className="px-6 py-4 text-sm font-medium text-primary">{result.domain}</td>
                    <td className="px-6 py-4 text-sm text-tertiary">{result.callCount.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <Badge color={result.scriptFound ? "success" : "gray"} size="sm">
                        {result.scriptFound ? "Found" : "Not Found"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      {result.accountContext ? (
                        <Link
                          href={`/accounts/${result.accountContext.id}`}
                          className="text-sm text-brand-primary hover:underline"
                        >
                          {result.accountContext.name}
                        </Link>
                      ) : (
                        <span className="text-sm text-quaternary">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {result.priorReview ? (
                        <Badge
                          color={result.priorReview.action === "blocked" ? "error" : "gray"}
                          size="sm"
                        >
                          {result.priorReview.action}
                        </Badge>
                      ) : (
                        <span className="text-sm text-quaternary">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {!result.priorReview ? (
                        <div className="flex items-center gap-2">
                          <Button
                            color="primary-destructive"
                            size="sm"
                            onClick={() => handleAction(result.domain, "blocked", "Unlicensed usage")}
                          >
                            Block
                          </Button>
                          <Button
                            color="secondary"
                            size="sm"
                            onClick={() => handleAction(result.domain, "dismissed")}
                          >
                            Dismiss
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-quaternary">Reviewed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
