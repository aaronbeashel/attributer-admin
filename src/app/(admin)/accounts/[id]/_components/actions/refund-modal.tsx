"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ModalOverlay, Modal, Dialog } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";

interface RefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  charge: {
    id: string;
    amount: number;
    amountRefunded: number;
    currency: string;
    created: number;
  };
}

export function RefundModal({ isOpen, onClose, accountId, charge }: RefundModalProps) {
  const router = useRouter();
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [partialAmount, setPartialAmount] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refundableAmount = charge.amount - charge.amountRefunded;
  const refundableDollars = (refundableAmount / 100).toFixed(2);

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      const amountCents = refundType === "partial" ? Math.round(parseFloat(partialAmount) * 100) : undefined;

      if (refundType === "partial" && (!amountCents || amountCents <= 0)) {
        toast.error("Enter a valid refund amount");
        setIsSubmitting(false);
        return;
      }

      const res = await fetch(`/api/account/${accountId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_API_KEY}` },
        body: JSON.stringify({ chargeId: charge.id, amount: amountCents, reason }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to issue refund");
      }

      const data = await res.json();
      toast.success("Refund issued", {
        description: `Refunded $${((data.refund?.amount || 0) / 100).toFixed(2)}`,
      });
      onClose();
      router.refresh();
    } catch (err) {
      toast.error("Failed to issue refund", {
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
            <h2 className="text-lg font-semibold text-primary">Refund Charge</h2>
            <p className="mt-1 text-sm text-tertiary">
              {new Date(charge.created * 1000).toLocaleDateString()} — ${(charge.amount / 100).toFixed(2)} {charge.currency.toUpperCase()}
              {charge.amountRefunded > 0 && (
                <span> (${(charge.amountRefunded / 100).toFixed(2)} already refunded)</span>
              )}
            </p>

            <div className="mt-5 space-y-4">
              <fieldset>
                <legend className="text-sm font-medium text-primary">Refund type</legend>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center gap-2 text-sm text-secondary">
                    <input
                      type="radio"
                      name="refundType"
                      checked={refundType === "full"}
                      onChange={() => setRefundType("full")}
                      className="accent-brand-primary"
                    />
                    Full refund (${refundableDollars})
                  </label>
                  <label className="flex items-center gap-2 text-sm text-secondary">
                    <input
                      type="radio"
                      name="refundType"
                      checked={refundType === "partial"}
                      onChange={() => setRefundType("partial")}
                      className="accent-brand-primary"
                    />
                    Partial refund
                  </label>
                </div>
              </fieldset>

              {refundType === "partial" && (
                <div>
                  <label className="block text-sm font-medium text-primary">Refund amount (USD)</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-tertiary">$</span>
                    <input
                      type="number"
                      min={0.01}
                      max={refundableAmount / 100}
                      step={0.01}
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-primary bg-primary py-2 pl-7 pr-3 text-sm text-primary shadow-xs"
                    />
                  </div>
                  <p className="mt-1 text-xs text-tertiary">Max refundable: ${refundableDollars}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-primary">Reason (optional)</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Customer requested refund"
                  className="mt-1 w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs placeholder:text-placeholder"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button color="secondary" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button color="primary-destructive" size="md" onClick={handleSubmit} isLoading={isSubmitting}>
                Issue Refund
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
