"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";

interface LicensingDomain {
  id: string;
  domain: string;
  callCount: number;
  lastSeenAt: string | null;
  isLicensed: boolean;
  isBlocked: boolean;
  scriptInstalled: boolean | null;
  checkError: string | null;
  status: string;
  accountId: string | null;
  accountName: string | null;
  accountEmail: string | null;
  createdAt: string;
}

interface StatusCounts {
  confirmed_unlicensed: number;
  pending_check: number;
  blocked: number;
  dismissed: number;
  licensed: number;
  not_installed: number;
  check_failed: number;
}

function getReasonText(domain: LicensingDomain): string {
  if (domain.status === "check_failed") {
    const errorDetail = domain.checkError ? ` — ${domain.checkError}` : "";
    if (!domain.accountId) {
      return `Cannot determine if code is installed${errorDetail}. Unknown domain, not linked to any Attributer account.`;
    }
    return `Cannot determine if code is installed${errorDetail}. Cancelled or expired customer, subscription no longer active.`;
  }
  if (!domain.accountId) {
    return "Unknown domain — not linked to any Attributer account. Script detected on site.";
  }
  return "Cancelled or expired customer — subscription is no longer active but script is still installed on site.";
}

function DomainCard({
  domain,
  onAction,
}: {
  domain: LicensingDomain;
  onAction: (domain: string, action: "blocked" | "dismissed") => void;
}) {
  const [acting, setActing] = useState(false);

  async function handleAction(action: "blocked" | "dismissed") {
    setActing(true);
    onAction(domain.domain, action);
    setActing(false);
  }

  return (
    <div className="rounded-xl border border-secondary bg-primary p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-md font-semibold text-primary break-all">{domain.domain}</h3>
        <span className="shrink-0 text-sm font-medium text-tertiary">
          {domain.callCount.toLocaleString()} calls
        </span>
      </div>

      {/* Badges */}
      <div className="mt-3 flex flex-wrap gap-2">
        {domain.status === "confirmed_unlicensed" && (
          <Badge color="success" size="sm">Code On Site ✓</Badge>
        )}
        {domain.status === "check_failed" && (
          <Badge color="warning" size="sm">Code Status Unknown</Badge>
        )}
        <Badge color="gray" size="sm">Not Blocked</Badge>
        {domain.accountId ? (
          <Badge color="brand" size="sm">Has Account</Badge>
        ) : (
          <Badge color="warning" size="sm">No Account</Badge>
        )}
      </div>

      {/* Reason */}
      <p className="mt-3 text-sm text-tertiary">{getReasonText(domain)}</p>

      {/* Dates */}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-quaternary">
        {domain.createdAt && (
          <span>First seen: {new Date(domain.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
        )}
        {domain.lastSeenAt && (
          <span>Last seen: {new Date(domain.lastSeenAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
        )}
      </div>

      {/* Links */}
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <a
          href={`https://${domain.domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-primary hover:underline"
        >
          Visit site ↗
        </a>
        {domain.accountId && (
          <Link href={`/accounts/${domain.accountId}`} className="text-brand-primary hover:underline">
            View account ↗
          </Link>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <Button
          color="secondary"
          size="sm"
          onClick={() => handleAction("dismissed")}
          isDisabled={acting}
          className="flex-1 sm:flex-none"
        >
          Dismiss
        </Button>
        <Button
          color="primary-destructive"
          size="sm"
          onClick={() => handleAction("blocked")}
          isDisabled={acting}
          className="flex-1 sm:flex-none"
        >
          Block
        </Button>
      </div>
    </div>
  );
}

export function ScanResults() {
  const [domains, setDomains] = useState<LicensingDomain[]>([]);
  const [counts, setCounts] = useState<StatusCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [minCalls, setMinCalls] = useState(50);

  const fetchDomains = useCallback(async () => {
    try {
      // Fetch both confirmed_unlicensed and check_failed domains
      const [confirmedRes, failedRes] = await Promise.all([
        fetch(`/api/licensing/domains?status=confirmed_unlicensed&minCalls=${minCalls}`),
        fetch(`/api/licensing/domains?status=check_failed&minCalls=${minCalls}`),
      ]);
      const confirmedData = await confirmedRes.json();
      const failedData = await failedRes.json();

      // Merge domains, confirmed first then failed
      setDomains([...(confirmedData.domains ?? []), ...(failedData.domains ?? [])]);
      setCounts(confirmedData.counts ?? failedData.counts ?? null);
    } catch {
      toast.error("Failed to load scan results");
    } finally {
      setLoading(false);
    }
  }, [minCalls]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  async function handleAction(domain: string, action: "blocked" | "dismissed") {
    try {
      const res = await fetch("/api/licensing/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, action, reason: action === "blocked" ? "Unlicensed usage" : undefined }),
      });

      if (res.ok) {
        setDomains((prev) => prev.filter((d) => d.domain !== domain));
        toast.success(action === "blocked" ? `Blocked ${domain}` : `Dismissed ${domain}`);
        fetchDomains();
      }
    } catch {
      toast.error(`Failed to ${action} ${domain}`);
    }
  }

  if (loading) {
    return <div className="rounded-xl border border-secondary bg-primary px-6 py-8 text-center text-sm text-tertiary">Loading scan results...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Status Summary */}
      {counts && (
        <div className="flex flex-wrap gap-3">
          <Badge color="error" size="md">{counts.confirmed_unlicensed} confirmed unlicensed</Badge>
          <Badge color="warning" size="md">{counts.check_failed} could not verify</Badge>
          <Badge color="gray" size="md">{counts.pending_check} pending check</Badge>
          <Badge color="gray" size="md">{counts.blocked} blocked</Badge>
          <Badge color="gray" size="md">{counts.dismissed} dismissed</Badge>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-tertiary">
          Min calls:
          <input
            type="number"
            value={minCalls}
            onChange={(e) => setMinCalls(parseInt(e.target.value, 10) || 0)}
            className="w-20 rounded-lg border border-secondary bg-primary px-2 py-1 text-sm text-primary"
          />
        </label>
        <span className="text-sm text-tertiary">{domains.length} domains</span>
      </div>

      {/* Cards */}
      {domains.length === 0 ? (
        <div className="rounded-xl border border-secondary bg-primary px-6 py-8 text-center">
          <p className="text-sm text-tertiary">
            {counts && counts.pending_check > 0
              ? `No results yet. ${counts.pending_check} domains are pending install check — results will appear as the checker service processes them.`
              : "No unlicensed domains found. All clear!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {domains.map((domain) => (
            <DomainCard key={domain.id} domain={domain} onAction={handleAction} />
          ))}
        </div>
      )}
    </div>
  );
}
