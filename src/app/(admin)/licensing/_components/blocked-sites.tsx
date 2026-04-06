"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";

interface BlockedDomain {
  id: string;
  domain: string;
  callCount: number;
  accountId: string | null;
  accountName: string | null;
  reviewedAt: string | null;
}

export function BlockedSites() {
  const [domains, setDomains] = useState<BlockedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchBlocked = useCallback(async () => {
    try {
      const params = new URLSearchParams({ status: "blocked" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/licensing/domains?${params}`);
      const data = await res.json();
      setDomains(data.domains ?? []);
    } catch {
      toast.error("Failed to load blocked sites");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(fetchBlocked, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchBlocked, search]);

  async function handleUnblock(domain: string) {
    try {
      const res = await fetch("/api/licensing/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, action: "unblocked" }),
      });

      if (res.ok) {
        setDomains((prev) => prev.filter((d) => d.domain !== domain));
        toast.success(`Unblocked ${domain}`);
      }
    } catch {
      toast.error(`Failed to unblock ${domain}`);
    }
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <input
        type="text"
        placeholder="Search blocked domains..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md rounded-lg border border-secondary bg-primary px-4 py-2 text-sm text-primary shadow-xs placeholder:text-placeholder"
      />

      {loading ? (
        <div className="rounded-xl border border-secondary bg-primary px-6 py-8 text-center text-sm text-tertiary">Loading blocked sites...</div>
      ) : domains.length === 0 ? (
        <div className="rounded-xl border border-secondary bg-primary px-6 py-8 text-center text-sm text-tertiary">
          {search ? "No blocked domains match your search." : "No blocked domains found."}
        </div>
      ) : (
        <div className="rounded-xl border border-secondary bg-primary shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-secondary bg-secondary">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Domain</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Calls</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Account</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Blocked</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-quaternary">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary">
                {domains.map((d) => (
                  <tr key={d.id}>
                    <td className="px-6 py-4 text-sm font-medium text-primary">{d.domain}</td>
                    <td className="px-6 py-4 text-sm text-tertiary">{d.callCount.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      {d.accountId ? (
                        <Link href={`/accounts/${d.accountId}`} className="text-sm text-brand-primary hover:underline">
                          {d.accountName}
                        </Link>
                      ) : (
                        <span className="text-sm text-quaternary">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-tertiary">
                      {d.reviewedAt ? new Date(d.reviewedAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button color="secondary" size="sm" onClick={() => handleUnblock(d.domain)}>
                        Unblock
                      </Button>
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
