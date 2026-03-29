"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ModalOverlay, Modal, Dialog } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";

interface TransferOwnershipModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  currentEmail: string;
}

export function TransferOwnershipModal({ isOpen, onClose, accountId, currentEmail }: TransferOwnershipModalProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [sendPasswordReset, setSendPasswordReset] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (!email) return;
    setIsSubmitting(true);

    try {
      // Transfer ownership
      const res = await fetch(`/api/account/${accountId}/owner`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_API_KEY}` },
        body: JSON.stringify({ email, firstName: firstName || undefined, lastName: lastName || undefined, company: company || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to transfer ownership");
      }

      // Send password reset if checked
      if (sendPasswordReset) {
        await fetch(`/api/account/${accountId}/password-reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_API_KEY}` },
          body: JSON.stringify({ email }),
        });
      }

      toast.success("Ownership transferred", {
        description: `Transferred from ${currentEmail} to ${email}`,
      });
      onClose();
      router.refresh();
    } catch (err) {
      toast.error("Failed to transfer ownership", {
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
            <h2 className="text-lg font-semibold text-primary">Transfer Ownership</h2>
            <p className="mt-1 text-sm text-tertiary">
              This changes the account email, updates login credentials, and syncs to Stripe. The new owner will need to reset their password.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-primary">New Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="new-owner@company.com"
                  className="mt-1 w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs placeholder:text-placeholder"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-primary">First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-primary">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-primary">Company</label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-secondary">
                <input
                  type="checkbox"
                  checked={sendPasswordReset}
                  onChange={(e) => setSendPasswordReset(e.target.checked)}
                  className="accent-brand-primary"
                />
                Send password reset email to new owner
              </label>
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
                isDisabled={!email}
              >
                Transfer Ownership
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
