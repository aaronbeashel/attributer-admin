"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ModalOverlay, Modal, Dialog } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { LICENSING_WRITES_DISABLED_MESSAGE } from "@/lib/licensing/messages";
import { parseWebsiteAddress } from "@/lib/site-address";
import type { SiteConflict, UnblockOutcome } from "@/lib/sites/edit-site-address";

interface EditSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  site: { id: string; name: string; domain: string | null; websiteUrl: string | null };
  onSaved: () => void;
}

interface SharedRootWarning {
  message: string;
  conflicts: SiteConflict[];
  /** The domain this warning is about. "Save anyway" confirms exactly this domain. */
  domain: string;
}

/** The website URL on file points at the stored domain. */
function websiteUrlMatchesDomain(site: EditSiteModalProps["site"]): boolean {
  if (!site.websiteUrl) return false;
  const parsed = parseWebsiteAddress(site.websiteUrl);
  return parsed.ok && parsed.domain === site.domain;
}

function startingValue(site: EditSiteModalProps["site"]): string {
  if (websiteUrlMatchesDomain(site)) return site.websiteUrl!;
  return site.domain ? `https://${site.domain}` : "";
}

function showSavedToasts(data: {
  site: { domain: string };
  unblock: UnblockOutcome;
  eventLogged: boolean;
  unblockRecorded: boolean;
}) {
  const domain = data.site.domain;
  const description =
    data.unblock === "unblocked"
      ? "It was blocked and has been unblocked. It can take up to 24 hours to reach visitors."
      : data.unblock === "skipped"
        ? "Not checked for a block, because this site isn't active or the account isn't paying."
        : undefined;
  toast.success(`Saved ${domain}`, description ? { description } : undefined);

  if (data.unblock === "failed") {
    toast.warning(`Saved, but we couldn't unblock ${domain}. Use Unblock on this site to try again.`);
  }
  if (data.unblock === "check_failed") {
    toast.warning(`Saved, but we couldn't check whether ${domain} is blocked. Refresh in a minute and use Unblock if it shows Blocked.`);
  }
  if (data.unblock === "disabled") {
    toast.warning(LICENSING_WRITES_DISABLED_MESSAGE);
  }
  if (data.eventLogged === false) {
    toast.warning("Saved, but the activity log entry failed.");
  }
  if (data.unblockRecorded === false) {
    toast.warning("Unblocked, but the licensing record didn't save. Tell Claude.");
  }
}

/**
 * Correct a site's website address. Mounted fresh each time it opens (and per
 * site), so the field always starts from the site's current address.
 */
export function EditSiteModal({ isOpen, onClose, accountId, site, onSaved }: EditSiteModalProps) {
  const [value, setValue] = useState(() => startingValue(site));
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<SharedRootWarning | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsed = parseWebsiteAddress(value);
  const newDomain = parsed.ok ? parsed.domain : null;
  const unchanged = newDomain !== null && newDomain === site.domain;
  const showUrlOnFile = !!site.websiteUrl && !websiteUrlMatchesDomain(site);

  async function handleSave() {
    if (!parsed.ok) return;
    const confirmedDomain = warning && warning.domain === parsed.domain ? warning.domain : null;

    setIsSubmitting(true);
    setError(null);
    try {
      let res: Response;
      try {
        res = await fetch(`/api/account/${accountId}/sites/${site.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ websiteUrl: value, expectedDomain: site.domain, confirmedDomain }),
        });
      } catch {
        setError("Not saved. Couldn't reach the server. Try again.");
        return;
      }

      const data = await res.json().catch(() => ({}));

      if (res.status === 409 && data.needsConfirmation) {
        setWarning({ message: data.message, conflicts: data.conflicts ?? [], domain: parsed.domain });
        return;
      }

      if (!res.ok) {
        setWarning(null);
        setError(
          res.status === 401
            ? "Your sign-in has expired. Reload the page and sign in again."
            : (data.error ?? `Something went wrong (HTTP ${res.status}). Refresh the page to see whether it saved.`)
        );
        return;
      }

      // A success status without the saved shape: we can't tell what happened
      if (!data.success || !data.site) {
        setWarning(null);
        setError("Saved status unknown. Refresh the page to check.");
        return;
      }

      showSavedToasts(data);
      onSaved();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable>
      <Modal className="max-w-lg">
        <Dialog className="block">
          <div className="rounded-xl bg-primary p-6">
            <h2 className="text-lg font-semibold text-primary">Edit site</h2>
            <p className="mt-1 text-sm text-tertiary">
              Change the website address for <span className="font-medium text-primary">{site.name}</span>. Use this
              to fix a typo. If the corrected domain is blocked, it&apos;s unblocked. The old address is not blocked.
            </p>

            <div className="mt-5 space-y-2">
              <Input
                label="Website address"
                value={value}
                onChange={(v) => {
                  setValue(v);
                  setError(null);
                  setWarning(null);
                }}
                placeholder="https://www.example.com"
                isInvalid={!!error}
                hint={error ?? undefined}
                size="md"
              />
              {showUrlOnFile && (
                <p className="break-all text-sm text-tertiary">Website URL on file is {site.websiteUrl}.</p>
              )}
              <p className="text-sm text-tertiary">
                Domain:{" "}
                <span className="font-medium text-primary">{newDomain ?? "—"}</span>
                {site.domain && !unchanged && newDomain ? (
                  <span className="text-quaternary"> (was {site.domain})</span>
                ) : null}
              </p>
              {warning && (
                <div className="rounded-md bg-warning-secondary px-3 py-2 text-sm text-warning-primary">
                  <p className="whitespace-pre-line">{warning.message}</p>
                  {warning.conflicts.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5">
                      {warning.conflicts.map((c, i) => (
                        <li key={`${c.accountEmail}-${c.domain}-${i}`} className="break-all">
                          {c.accountEmail ?? "Unknown account"}
                          {c.sameAccount ? " (this account)" : ""}, {c.domain}, {c.status}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button color="secondary" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button
                color="primary"
                size="md"
                onClick={handleSave}
                isLoading={isSubmitting}
                isDisabled={!parsed.ok || unchanged}
              >
                {warning ? "Save anyway" : "Save"}
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
