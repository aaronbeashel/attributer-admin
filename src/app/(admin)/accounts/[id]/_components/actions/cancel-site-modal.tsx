"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ModalOverlay, Modal, Dialog } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { CANCELLATION_REASONS } from "@/config/cancellation-reasons";

interface CancelSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  site: { id: string; name: string; domain: string | null };
  onCancelled: (domain: string | null) => void;
}

export function CancelSiteModal({ isOpen, onClose, accountId, site, onCancelled }: CancelSiteModalProps) {
  const router = useRouter();
  // Prefilled to mirror an admin-initiated cancellation
  const [reasonId, setReasonId] = useState("other");
  const [feedback, setFeedback] = useState("Cancelled manually by Admin");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedReason = CANCELLATION_REASONS.find((r) => r.id === reasonId);

  async function handleSubmit() {
    setIsSubmitting(true);

    try {
      const reasonLabel = CANCELLATION_REASONS.find((r) => r.id === reasonId)?.label ?? reasonId;

      const res = await fetch(`/api/account/${accountId}/sites/${site.id}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_API_KEY}`,
        },
        body: JSON.stringify({ reason: reasonLabel, feedback }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to cancel site");
      }

      toast.success(`Cancelled ${site.name}`, {
        description: site.domain
          ? `${site.domain} set to inactive and blocked`
          : "Site set to inactive",
      });
      onCancelled(site.domain);
      onClose();
      router.refresh();
    } catch (err) {
      toast.error("Failed to cancel site", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable>
      <Modal className="max-w-lg">
        <Dialog className="block">
          <div className="rounded-xl bg-primary p-6">
            <h2 className="text-lg font-semibold text-primary">Cancel Site</h2>
            <p className="mt-1 text-sm text-tertiary">
              This sets <span className="font-medium text-primary">{site.name}</span> to inactive
              {site.domain ? (
                <>
                  {" "}and blocks <span className="font-medium text-primary">{site.domain}</span> in the
                  licensing system
                </>
              ) : null}
              {" "}— the same thing that happens when a customer cancels a site themselves. The
              account&apos;s subscription and billing are not changed.
            </p>

            <div className="mt-5 space-y-4">
              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-primary">Reason</label>
                <select
                  value={reasonId}
                  onChange={(e) => setReasonId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs"
                >
                  {CANCELLATION_REASONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Feedback */}
              <div>
                <label className="block text-sm font-medium text-primary">
                  {selectedReason?.feedbackLabel ?? "Notes"}
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder={selectedReason?.feedbackPlaceholder}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs placeholder:text-placeholder"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button color="secondary" size="md" onClick={onClose}>
                Keep site
              </Button>
              <Button color="primary-destructive" size="md" onClick={handleSubmit} isLoading={isSubmitting}>
                Cancel site
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
