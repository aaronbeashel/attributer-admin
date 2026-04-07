"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";

interface LookupResult {
  domain: string;
  isBlocked: boolean;
  inSystem: boolean;
  lastBlocked: string | null;
  lastUnblocked: string | null;
  history: Array<{ action: string; timestamp: string }>;
}

export function DomainLookup() {
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLookup() {
    if (!domain.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/licensing/lookup?domain=${encodeURIComponent(domain.trim())}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Lookup failed");
      }
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(action: "blocked" | "unblocked") {
    try {
      const res = await fetch("/api/licensing/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim(), action, reason: action === "blocked" ? "Manual block" : undefined }),
      });

      if (res.ok) {
        toast.success(action === "blocked" ? `Blocked ${domain}` : `Unblocked ${domain}`);
        handleLookup(); // Refresh
      }
    } catch {
      toast.error(`Failed to ${action} ${domain}`);
    }
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          placeholder="Enter a domain (e.g. acme.com)"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLookup()}
          className="w-full rounded-lg border border-secondary bg-primary px-4 py-2 text-sm text-primary shadow-xs placeholder:text-placeholder sm:max-w-md"
        />
        <Button color="primary" size="md" onClick={handleLookup} isLoading={loading}>
          Look up
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-error-secondary bg-error-secondary p-4 text-sm text-error-primary">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-secondary bg-primary p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div>
              <h3 className="break-all text-lg font-semibold text-primary">{result.domain}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.isBlocked ? (
                  <Badge color="error" size="md">Blocked</Badge>
                ) : (
                  <Badge color="success" size="md">Not Blocked</Badge>
                )}
                {!result.inSystem && (
                  <Badge color="gray" size="md">Not in block list</Badge>
                )}
              </div>
            </div>

            <div>
              {result.isBlocked ? (
                <Button color="secondary" size="sm" onClick={() => handleAction("unblocked")}>
                  Unblock
                </Button>
              ) : (
                <Button color="primary-destructive" size="sm" onClick={() => handleAction("blocked")}>
                  Block
                </Button>
              )}
            </div>
          </div>

          {result.inSystem && (
            <div className="mt-4 space-y-2">
              {result.lastBlocked && (
                <p className="text-sm text-tertiary">
                  Last blocked: {new Date(result.lastBlocked).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              )}
              {result.lastUnblocked && (
                <p className="text-sm text-tertiary">
                  Last unblocked: {new Date(result.lastUnblocked).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              )}

              {result.history && result.history.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-primary">History</h4>
                  <div className="mt-2 space-y-1">
                    {result.history.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-tertiary">
                        <Badge color={entry.action === "blocked" ? "error" : "success"} size="sm">
                          {entry.action}
                        </Badge>
                        <span>{new Date(entry.timestamp).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
