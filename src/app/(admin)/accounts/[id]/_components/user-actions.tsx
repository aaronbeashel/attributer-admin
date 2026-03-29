"use client";

import { useState } from "react";
import { Key01 } from "@untitledui/icons";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { PasswordResetModal } from "./actions/password-reset-modal";

interface UserActionsProps {
  accountId: string;
  userEmail: string;
}

export function UserActions({ accountId, userEmail }: UserActionsProps) {
  const [showPasswordReset, setShowPasswordReset] = useState(false);

  return (
    <>
      <Dropdown.Root>
        <Dropdown.DotsButton />
        <Dropdown.Popover className="w-48">
          <Dropdown.Menu>
            <Dropdown.Item icon={Key01} onAction={() => setShowPasswordReset(true)}>
              Send Password Reset
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown.Root>

      <PasswordResetModal
        isOpen={showPasswordReset}
        onClose={() => setShowPasswordReset(false)}
        accountId={accountId}
        userEmail={userEmail}
      />
    </>
  );
}
