"use client";

import { Globe01 } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { SlideoutMenu } from "@/components/application/slideout-menus/slideout-menu";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import type { AccountSite } from "@/lib/queries/account-detail";
import { formatDate } from "@/lib/utils/format";
import { CopyableLink } from "../../_components/copyable-link";

interface LicensingRecord {
  isBlocked: boolean;
  blockedAt: string | null;
}

interface SiteDetailsProps {
  site: AccountSite;
  licensing?: LicensingRecord;
  loadingLicensing: boolean;
  onLicensingAction: (domain: string, action: "blocked" | "unblocked") => void;
}

function Field({ label, value, href }: { label: string; value: string | null; href?: string }) {
  return (
    <div>
      <dt className="text-sm text-tertiary">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-primary">
        {href && value ? (
          <CopyableLink href={href} value={value} label={label} />
        ) : (
          <span className="break-all">{value || "—"}</span>
        )}
      </dd>
    </div>
  );
}

function resolveToolValue(value: string | null, other: string | null): string | null {
  if (!value) return null;
  if (value.toLowerCase() === "other" && other) return other;
  return value;
}

function LicensingBadge({
  site,
  licensing,
  loadingLicensing,
}: {
  site: AccountSite;
  licensing?: LicensingRecord;
  loadingLicensing: boolean;
}) {
  if (!site.domain) return <span className="text-xs text-quaternary">—</span>;
  if (loadingLicensing) return <span className="text-xs text-quaternary">Checking...</span>;
  return licensing?.isBlocked ? (
    <Badge color="error" size="sm">Blocked</Badge>
  ) : (
    <Badge color="success" size="sm">Unblocked</Badge>
  );
}

function LicensingActionButton({
  site,
  licensing,
  loadingLicensing,
  onLicensingAction,
}: {
  site: AccountSite;
  licensing?: LicensingRecord;
  loadingLicensing: boolean;
  onLicensingAction: (domain: string, action: "blocked" | "unblocked") => void;
}) {
  if (!site.domain || loadingLicensing) return null;
  return licensing?.isBlocked ? (
    <Button color="secondary" size="sm" onClick={() => onLicensingAction(site.domain!, "unblocked")}>
      Unblock
    </Button>
  ) : (
    <Button color="secondary-destructive" size="sm" onClick={() => onLicensingAction(site.domain!, "blocked")}>
      Block
    </Button>
  );
}

function SiteFieldGrid({ site }: { site: AccountSite }) {
  const cms = resolveToolValue(site.cms, site.cmsOther);
  const formTool = resolveToolValue(site.formTool, site.formToolOther);
  const crm = resolveToolValue(site.crm, site.crmOther);

  return (
    <>
      <Field label="Domain" value={site.domain} href={site.domain ? `https://${site.domain}` : undefined} />
      <Field label="Website URL" value={site.websiteUrl} href={site.websiteUrl ?? undefined} />
      <Field label="CMS" value={cms} />
      <Field label="Form Tool" value={formTool} />
      <Field label="CRM" value={crm} />
      <Field label="Created" value={formatDate(site.createdAt)} />
    </>
  );
}

export function SiteDetailsCard({ site, licensing, loadingLicensing, onLicensingAction }: SiteDetailsProps) {
  return (
    <div className="rounded-xl border border-secondary bg-primary">
      <div className="border-b border-secondary px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-primary">{site.name}</h2>
            {site.isDefault && <Badge color="gray" size="sm">Default</Badge>}
          </div>
          <div className="flex items-center gap-3">
            <Badge color={site.status === "active" ? "success" : "gray"} size="md">
              {site.status.charAt(0).toUpperCase() + site.status.slice(1)}
            </Badge>
            <LicensingBadge site={site} licensing={licensing} loadingLicensing={loadingLicensing} />
            <LicensingActionButton
              site={site}
              licensing={licensing}
              loadingLicensing={loadingLicensing}
              onLicensingAction={onLicensingAction}
            />
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 sm:gap-6 sm:px-6 sm:py-5 lg:grid-cols-3">
        <SiteFieldGrid site={site} />
      </dl>
    </div>
  );
}

interface SiteDetailsDrawerProps extends SiteDetailsProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SiteDetailsDrawer({
  site,
  licensing,
  loadingLicensing,
  onLicensingAction,
  isOpen,
  onOpenChange,
}: SiteDetailsDrawerProps) {
  return (
    <SlideoutMenu isOpen={isOpen} onOpenChange={onOpenChange} isDismissable>
      <SlideoutMenu.Header onClose={() => onOpenChange(false)} className="relative flex w-full items-start gap-3 px-4 pt-6 md:px-6">
        <FeaturedIcon size="md" color="gray" theme="modern" icon={Globe01} />
        <section className="flex min-w-0 flex-col gap-0.5 pr-8">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-md font-semibold text-primary md:text-lg">{site.name}</h1>
            {site.isDefault && <Badge color="gray" size="sm">Default</Badge>}
          </div>
          {site.domain ? (
            <div className="text-sm">
              <CopyableLink href={`https://${site.domain}`} value={site.domain} label="Domain" />
            </div>
          ) : (
            <p className="text-sm text-tertiary">No domain set</p>
          )}
        </section>
      </SlideoutMenu.Header>

      <SlideoutMenu.Content>
        <section className="flex flex-wrap items-center gap-2">
          <Badge color={site.status === "active" ? "success" : "gray"} size="md">
            {site.status.charAt(0).toUpperCase() + site.status.slice(1)}
          </Badge>
          <LicensingBadge site={site} licensing={licensing} loadingLicensing={loadingLicensing} />
        </section>

        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
          <SiteFieldGrid site={site} />
        </dl>
      </SlideoutMenu.Content>

      <SlideoutMenu.Footer className="flex w-full justify-end gap-3">
        <Button size="sm" color="secondary" onClick={() => onOpenChange(false)}>
          Close
        </Button>
        <LicensingActionButton
          site={site}
          licensing={licensing}
          loadingLicensing={loadingLicensing}
          onLicensingAction={onLicensingAction}
        />
      </SlideoutMenu.Footer>
    </SlideoutMenu>
  );
}
