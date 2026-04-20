"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/base/badges/badges";
import type { AccountSite } from "@/lib/queries/account-detail";
import { SiteDetailsCard, SiteDetailsDrawer } from "./site-details";

interface SitesSectionProps {
  sites: AccountSite[];
  accountId: string;
}

interface LicensingStatus {
  [domain: string]: { isBlocked: boolean; blockedAt: string | null };
}

function resolveToolValue(value: string | null, other: string | null): string | null {
  if (!value) return null;
  if (value.toLowerCase() === "other" && other) return other;
  return value;
}

export function SitesSection({ sites, accountId }: SitesSectionProps) {
  const [licensing, setLicensing] = useState<LicensingStatus>({});
  const [loadingLicensing, setLoadingLicensing] = useState(true);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

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

  if (sites.length === 0) {
    return (
      <div className="rounded-xl border border-secondary bg-primary">
        <div className="flex items-center justify-between border-b border-secondary px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="text-lg font-semibold text-primary">Sites</h2>
        </div>
        <p className="px-4 py-8 text-center text-sm text-tertiary">No sites configured</p>
      </div>
    );
  }

  if (sites.length === 1) {
    const site = sites[0];
    return (
      <SiteDetailsCard
        site={site}
        licensing={site.domain ? licensing[site.domain] : undefined}
        loadingLicensing={loadingLicensing}
        onLicensingAction={handleLicensingAction}
      />
    );
  }

  const selectedSite = sites.find((s) => s.id === selectedSiteId) ?? null;

  return (
    <div className="rounded-xl border border-secondary bg-primary">
      <div className="flex items-center justify-between border-b border-secondary px-4 py-3 sm:px-6 sm:py-4">
        <h2 className="text-lg font-semibold text-primary">Sites</h2>
        <Badge color="gray" size="sm">
          {sites.filter((s) => s.status === "active").length} active
        </Badge>
      </div>

      {/* Mobile Card List */}
      <div className="divide-y divide-secondary sm:hidden">
        {sites.map((site) => {
          const lic = site.domain ? licensing[site.domain] : undefined;
          return (
            <button
              key={site.id}
              type="button"
              onClick={() => setSelectedSiteId(site.id)}
              className="block w-full px-4 py-3 text-left hover:bg-secondary"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-primary">{site.name}</span>
                    {site.isDefault && <Badge color="gray" size="sm">Default</Badge>}
                  </div>
                  {site.domain && (
                    <span className="mt-0.5 block break-all text-sm text-tertiary">{site.domain}</span>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge color={site.status === "active" ? "success" : "gray"} size="sm">
                      {site.status.charAt(0).toUpperCase() + site.status.slice(1)}
                    </Badge>
                    {!loadingLicensing && site.domain && (
                      lic?.isBlocked ? (
                        <Badge color="error" size="sm">Blocked</Badge>
                      ) : (
                        <Badge color="success" size="sm">Unblocked</Badge>
                      )
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Desktop Table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-secondary bg-secondary">
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Name</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Domain</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Form Tool</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">CRM</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Status</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Licensing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {sites.map((site) => {
              const lic = site.domain ? licensing[site.domain] : undefined;
              const formTool = resolveToolValue(site.formTool, site.formToolOther);
              const crm = resolveToolValue(site.crm, site.crmOther);
              return (
                <tr
                  key={site.id}
                  onClick={() => setSelectedSiteId(site.id)}
                  className="cursor-pointer hover:bg-secondary"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-primary">{site.name}</span>
                      {site.isDefault && (
                        <Badge color="gray" size="sm">Default</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-tertiary">
                    {site.domain || "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-tertiary">
                    {formTool || "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-tertiary">
                    {crm || "—"}
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedSite && (
        <SiteDetailsDrawer
          site={selectedSite}
          licensing={selectedSite.domain ? licensing[selectedSite.domain] : undefined}
          loadingLicensing={loadingLicensing}
          onLicensingAction={handleLicensingAction}
          isOpen={Boolean(selectedSiteId)}
          onOpenChange={(open) => {
            if (!open) setSelectedSiteId(null);
          }}
        />
      )}
    </div>
  );
}
