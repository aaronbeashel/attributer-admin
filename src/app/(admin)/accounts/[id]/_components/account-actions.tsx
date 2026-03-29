"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserSquare, SwitchHorizontal01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { CancelModal } from "./actions/cancel-modal";
import { TransferOwnershipModal } from "./actions/transfer-ownership-modal";

interface AccountActionsProps {
  accountId: string;
  companyName: string;
  email: string;
  currentPeriodEnd: string | null;
  sites: Array<{ domain: string }>;
}

export function AccountActions({ accountId, companyName, email, currentPeriodEnd, sites }: AccountActionsProps) {
  const router = useRouter();
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);

  async function handleImpersonate() {
    setIsImpersonating(true);
    try {
      const res = await fetch(`/api/account/${accountId}/impersonate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_API_KEY}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to impersonate");
      }

      const data = await res.json();
      window.open(data.url, "_blank");
    } catch (err) {
      toast.error("Failed to impersonate", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsImpersonating(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          color="secondary"
          size="sm"
          onClick={handleImpersonate}
          isLoading={isImpersonating}
          iconLeading={UserSquare}
        >
          Impersonate
        </Button>

        <Dropdown.Root>
          <Dropdown.DotsButton />

          <Dropdown.Popover className="w-52">
            <Dropdown.Menu>
              <Dropdown.Item
                icon={SwitchHorizontal01}
                onAction={() => setShowTransferModal(true)}
              >
                Transfer Ownership
              </Dropdown.Item>
              <Dropdown.Item
                icon={XClose}
                onAction={() => setShowCancelModal(true)}
                className="text-error-primary"
              >
                Cancel Account
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown.Root>
      </div>

      <CancelModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        accountId={accountId}
        companyName={companyName}
        currentPeriodEnd={currentPeriodEnd}
        sites={sites}
      />

      <TransferOwnershipModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        accountId={accountId}
        currentEmail={email}
      />
    </>
  );
}
