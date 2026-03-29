"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ModalOverlay, Modal, Dialog } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";

interface ExtendTrialModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  currentTrialEnd: string | null;
}

export function ExtendTrialModal({ isOpen, onClose, accountId, currentTrialEnd }: ExtendTrialModalProps) {
  const router = useRouter();
  const [days, setDays] = useState(7);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentEnd = currentTrialEnd ? new Date(currentTrialEnd) : new Date();
  const newEnd = new Date(currentEnd);
  newEnd.setDate(newEnd.getDate() + days);

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/account/${accountId}/trial`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_API_KEY}` },
        body: JSON.stringify({ days }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to extend trial");
      }

      toast.success("Trial extended", {
        description: `New trial end: ${newEnd.toLocaleDateString()}`,
      });
      onClose();
      router.refresh();
    } catch (err) {
      toast.error("Failed to extend trial", {
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
            <h2 className="text-lg font-semibold text-primary">Extend Trial</h2>
            {currentTrialEnd && (
              <p className="mt-1 text-sm text-tertiary">
                Current trial ends: {new Date(currentTrialEnd).toLocaleDateString()}
              </p>
            )}

            <div className="mt-5">
              <label className="block text-sm font-medium text-primary">Extend by (days)</label>
              <input
                type="number"
                min={1}
                max={90}
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value) || 7)}
                className="mt-1 w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs"
              />
              <p className="mt-2 text-sm text-tertiary">
                New trial end: <span className="font-medium text-primary">{newEnd.toLocaleDateString()}</span>
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button color="secondary" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button color="primary" size="md" onClick={handleSubmit} isLoading={isSubmitting}>
                Extend Trial
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
