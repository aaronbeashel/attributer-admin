"use client";

import { useState } from "react";
import { SwitchHorizontal01, RefreshCcw01, Edit01, CreditCard02 } from "@untitledui/icons";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { ChangePlanModal } from "./actions/change-plan-modal";
import { ExtendTrialModal } from "./actions/extend-trial-modal";
import { ApplyDiscountModal } from "./actions/apply-discount-modal";
import { ApplyCreditModal } from "./actions/apply-credit-modal";

interface SubscriptionActionsProps {
  accountId: string;
  planId: string;
  planName: string;
  planPriceCents: number;
  status: string;
  trialEndsAt: string | null;
}

export function SubscriptionActions({
  accountId,
  planId,
  planName,
  planPriceCents,
  status,
  trialEndsAt,
}: SubscriptionActionsProps) {
  const [showChangePlan, setShowChangePlan] = useState(false);
  const [showExtendTrial, setShowExtendTrial] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showCredit, setShowCredit] = useState(false);

  return (
    <>
      <Dropdown.Root>
        <Dropdown.DotsButton />

        <Dropdown.Popover className="w-52">
          <Dropdown.Menu>
            <Dropdown.Item
              icon={SwitchHorizontal01}
              onAction={() => setShowChangePlan(true)}
            >
              Change Plan
            </Dropdown.Item>
            {status === "trialing" && (
              <Dropdown.Item
                icon={RefreshCcw01}
                onAction={() => setShowExtendTrial(true)}
              >
                Extend Trial
              </Dropdown.Item>
            )}
            <Dropdown.Item
              icon={Edit01}
              onAction={() => setShowDiscount(true)}
            >
              Apply Discount
            </Dropdown.Item>
            <Dropdown.Item
              icon={CreditCard02}
              onAction={() => setShowCredit(true)}
            >
              Apply Credit
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown.Root>

      <ChangePlanModal
        isOpen={showChangePlan}
        onClose={() => setShowChangePlan(false)}
        accountId={accountId}
        currentPlanId={planId}
        currentPlanName={planName}
        currentPriceCents={planPriceCents}
      />

      <ExtendTrialModal
        isOpen={showExtendTrial}
        onClose={() => setShowExtendTrial(false)}
        accountId={accountId}
        currentTrialEnd={trialEndsAt}
      />

      <ApplyDiscountModal
        isOpen={showDiscount}
        onClose={() => setShowDiscount(false)}
        accountId={accountId}
      />

      <ApplyCreditModal
        isOpen={showCredit}
        onClose={() => setShowCredit(false)}
        accountId={accountId}
      />
    </>
  );
}
