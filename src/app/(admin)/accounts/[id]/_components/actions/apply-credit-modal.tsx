"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ModalOverlay, Modal, Dialog } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";

interface ApplyCreditModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
}

export function ApplyCreditModal({ isOpen, onClose, accountId }: ApplyCreditModalProps) {
  const [amountDollars, setAmountDollars] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    const cents = Math.round(parseFloat(amountDollars) * 100);
    if (!cents || cents <= 0) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/account/${accountId}/credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_API_KEY}` },
        body: JSON.stringify({ amount: cents, reason }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to apply credit");
      }

      toast.success("Credit applied", {
        description: `Applied $${parseFloat(amountDollars).toFixed(2)} credit`,
      });
      onClose();
      setAmountDollars("");
      setReason("");
    } catch (err) {
      toast.error("Failed to apply credit", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable>
      <Modal className="max-w-md">
        <Dialog className="block">
          <div className="rounded-xl bg-primary p-6">
            <h2 className="text-lg font-semibold text-primary">Apply Account Credit</h2>
            <p className="mt-1 text-sm text-tertiary">
              Credit will be applied to the customer&apos;s next invoice.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-primary">Amount (USD)</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-tertiary">$</span>
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={amountDollars}
                    onChange={(e) => setAmountDollars(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-primary bg-primary py-2 pl-7 pr-3 text-sm text-primary shadow-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-primary">Reason (optional)</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Compensation for downtime"
                  className="mt-1 w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs placeholder:text-placeholder"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button color="secondary" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button
                color="primary"
                size="md"
                onClick={handleSubmit}
                isLoading={isSubmitting}
                isDisabled={!amountDollars || parseFloat(amountDollars) <= 0}
              >
                Apply Credit
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
