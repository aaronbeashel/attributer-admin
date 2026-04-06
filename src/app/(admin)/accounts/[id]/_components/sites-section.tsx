"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import type { AccountSite } from "@/lib/queries/account-detail";
import { formatDate } from "@/lib/utils/format";

interface SitesSectionProps {
  sites: AccountSite[];
  accountId: string;
}

interface LicensingStatus {
  [domain: string]: { isBlocked: boolean; blockedAt: string | null };
}

export function SitesSection({ sites, accountId }: SitesSectionProps) {
  const [licensing, setLicensing] = useState<LicensingStatus>({});
  const [loadingLicensing, setLoadingLicensing] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/account/${accountId}/licensing`, {
      headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_API_KEY}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const map: LicensingStatus = {};
        for (const s of data.sites ?? []) {
          if (s.domain) map[s.domain] = { isBlocked: s.isBlocked, blockedAt: s.blockedAt };
        }
        setLicensing(map);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingLicensing(false); });
    return () => { cancelled = true; };
  }, [accountId]);

  async function handleLicensingAction(domain: string, action: "blocked" | "unblocked") {
    try {
      const res = await fetch("/api/licensing/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, action, reason: action === "blocked" ? "Manual block from account page" : undefined }),
      });

      if (res.ok) {
        setLicensing((prev) => ({
          ...prev,
          [domain]: { isBlocked: action === "blocked", blockedAt: action === "blocked" ? new Date().toISOString() : null },
        }));
        toast.success(action === "blocked" ? `Blocked ${domain}` : `Unblocked ${domain}`);
      }
    } catch {
      toast.error(`Failed to ${action} ${domain}`);
    }
  }

  return (
    <div className="rounded-xl border border-secondary bg-primary">
      <div className="flex items-center justify-between border-b border-secondary px-6 py-4">
        <h2 className="text-lg font-semibold text-primary">Sites</h2>
        <Badge color="gray" size="sm">
          {sites.filter((s) => s.status === "active").length} active
        </Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-secondary bg-secondary">
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Name</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Domain</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Status</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Licensing</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-quaternary">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {sites.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-tertiary">
                  No sites configured
                </td>
              </tr>
            ) : (
              sites.map((site) => {
                const lic = site.domain ? licensing[site.domain] : undefined;
                return (
                  <tr key={site.id}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-primary">{site.name}</span>
                        {site.isDefault && (
                          <Badge color="gray" size="sm">Default</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-tertiary">
                      {site.domain ? (
                        <a
                          href={`https://${site.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-primary hover:underline"
                        >
                          {site.domain}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Badge color={site.status === "active" ? "success" : "gray"} size="sm">
                        {site.status.charAt(0).toUpperCase() + site.status.slice(1)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      {loadingLicensing ? (
                        <span className="text-xs text-quaternary">Checking...</span>
                      ) : !site.domain ? (
                        <span className="text-xs text-quaternary">—</span>
                      ) : lic?.isBlocked ? (
                        <Badge color="error" size="sm">Blocked</Badge>
                      ) : (
                        <Badge color="success" size="sm">Unblocked</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {site.domain && !loadingLicensing && (
                        lic?.isBlocked ? (
                          <Button color="secondary" size="sm" onClick={() => handleLicensingAction(site.domain!, "unblocked")}>
                            Unblock
                          </Button>
                        ) : (
                          <Button color="secondary-destructive" size="sm" onClick={() => handleLicensingAction(site.domain!, "blocked")}>
                            Block
                          </Button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
