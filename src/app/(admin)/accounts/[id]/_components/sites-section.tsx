import { Badge } from "@/components/base/badges/badges";
import type { AccountSite } from "@/lib/queries/account-detail";
import { formatDate } from "@/lib/utils/format";

interface SitesSectionProps {
  sites: AccountSite[];
}

export function SitesSection({ sites }: SitesSectionProps) {
  return (
    <div className="rounded-xl border border-secondary bg-primary">
      <div className="border-b border-secondary px-6 py-4">
        <h2 className="text-lg font-semibold text-primary">Sites</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-secondary bg-secondary">
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Name</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Domain</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">CMS</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Form Tool</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">CRM</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Added</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {sites.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-sm text-tertiary">
                  No sites configured
                </td>
              </tr>
            ) : (
              sites.map((site) => (
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
                  <td className="px-6 py-4 text-sm text-tertiary">{site.cms || site.cmsOther || "—"}</td>
                  <td className="px-6 py-4 text-sm text-tertiary">{site.formTool || site.formToolOther || "—"}</td>
                  <td className="px-6 py-4 text-sm text-tertiary">{site.crm || site.crmOther || "—"}</td>
                  <td className="px-6 py-4 text-sm text-tertiary">{formatDate(site.createdAt)}</td>
                  <td className="px-6 py-4">
                    <Badge color={site.isActive ? "success" : "gray"} size="sm">
                      {site.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
