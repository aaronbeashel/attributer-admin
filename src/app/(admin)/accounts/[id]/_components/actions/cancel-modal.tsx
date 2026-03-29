"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ModalOverlay, Modal, Dialog } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { CANCELLATION_REASONS } from "@/config/cancellation-reasons";

interface CancelModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  companyName: string;
  currentPeriodEnd: string | null;
  sites: Array<{ domain: string }>;
}

export function CancelModal({ isOpen, onClose, accountId, companyName, currentPeriodEnd, sites }: CancelModalProps) {
  const router = useRouter();
  const [atPeriodEnd, setAtPeriodEnd] = useState(false);
  const [reasonId, setReasonId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [blockSites, setBlockSites] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedReason = CANCELLATION_REASONS.find((r) => r.id === reasonId);

  async function handleSubmit() {
    if (!reasonId) return;
    setIsSubmitting(true);

    try {
      const reasonLabel = CANCELLATION_REASONS.find((r) => r.id === reasonId)?.label ?? reasonId;

      const res = await fetch(`/api/account/${accountId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_API_KEY}` },
        body: JSON.stringify({ atPeriodEnd, reason: reasonLabel, feedback }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel account");
      }

      // Block sites if checked
      if (blockSites && sites.length > 0) {
        for (const site of sites) {
          await fetch("/api/licensing/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain: site.domain, action: "blocked", reason: "Account cancelled" }),
          });
        }
      }

      toast.success("Account cancelled", {
        description: atPeriodEnd
          ? `Will cancel at end of billing period`
          : "Subscription cancelled immediately",
      });
      onClose();
      router.refresh();
    } catch (err) {
      toast.error("Failed to cancel account", {
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
            <h2 className="text-lg font-semibold text-primary">Cancel Account</h2>
            <p className="mt-1 text-sm text-tertiary">
              This will cancel <span className="font-medium text-primary">{companyName}</span>&apos;s subscription.
            </p>

            <div className="mt-5 space-y-4">
              {/* Timing */}
              <fieldset>
                <legend className="text-sm font-medium text-primary">When to cancel</legend>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center gap-2 text-sm text-secondary">
                    <input
                      type="radio"
                      name="timing"
                      checked={!atPeriodEnd}
                      onChange={() => setAtPeriodEnd(false)}
                      className="accent-brand-primary"
                    />
                    Cancel immediately
                  </label>
                  <label className="flex items-center gap-2 text-sm text-secondary">
                    <input
                      type="radio"
                      name="timing"
                      checked={atPeriodEnd}
                      onChange={() => setAtPeriodEnd(true)}
                      className="accent-brand-primary"
                    />
                    Cancel at end of billing period
                    {currentPeriodEnd && (
                      <span className="text-tertiary">
                        ({new Date(currentPeriodEnd).toLocaleDateString()})
                      </span>
                    )}
                  </label>
                </div>
              </fieldset>

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-primary">Reason</label>
                <select
                  value={reasonId}
                  onChange={(e) => setReasonId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs"
                >
                  <option value="">Select a reason...</option>
                  {CANCELLATION_REASONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Feedback */}
              {selectedReason && (
                <div>
                  <label className="block text-sm font-medium text-primary">
                    {selectedReason.feedbackLabel}
                  </label>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder={selectedReason.feedbackPlaceholder}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs placeholder:text-placeholder"
                  />
                </div>
              )}

              {/* Block sites */}
              {sites.length > 0 && (
                <label className="flex items-center gap-2 text-sm text-secondary">
                  <input
                    type="checkbox"
                    checked={blockSites}
                    onChange={(e) => setBlockSites(e.target.checked)}
                    className="accent-brand-primary"
                  />
                  Block site(s) in licensing system ({sites.map((s) => s.domain).join(", ")})
                </label>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button color="secondary" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button
                color="primary-destructive"
                size="md"
                onClick={handleSubmit}
                isLoading={isSubmitting}
                isDisabled={!reasonId}
              >
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
