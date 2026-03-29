"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ModalOverlay, Modal, Dialog } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";

interface PasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  userEmail: string;
}

export function PasswordResetModal({ isOpen, onClose, accountId, userEmail }: PasswordResetModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/account/${accountId}/password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_API_KEY}` },
        body: JSON.stringify({ email: userEmail }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send password reset");
      }

      toast.success("Password reset email sent", {
        description: `Sent to ${userEmail}`,
      });
      onClose();
    } catch (err) {
      toast.error("Failed to send password reset", {
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
            <h2 className="text-lg font-semibold text-primary">Send Password Reset</h2>
            <p className="mt-2 text-sm text-tertiary">
              This will send a password reset email to <span className="font-medium text-primary">{userEmail}</span>.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <Button color="secondary" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button color="primary" size="md" onClick={handleSubmit} isLoading={isSubmitting}>
                Send Email
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
