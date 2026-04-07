"use client";

import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
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
      <div className="flex flex-wrap items-center gap-2">
        <Button color="secondary" size="sm" onClick={() => setShowChangePlan(true)}>
          Change Plan
        </Button>
        {status === "trialing" && (
          <Button color="secondary" size="sm" onClick={() => setShowExtendTrial(true)}>
            Extend Trial
          </Button>
        )}
        <Button color="secondary" size="sm" onClick={() => setShowDiscount(true)}>
          Apply Discount
        </Button>
        <Button color="secondary" size="sm" onClick={() => setShowCredit(true)}>
          Apply Credit
        </Button>
      </div>

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
