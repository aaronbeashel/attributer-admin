"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ModalOverlay, Modal, Dialog } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { PLANS, getPriceForBillingPeriod } from "@/config/plans";

interface ChangePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  currentPlanId: string;
  currentPlanName: string;
  currentPriceCents: number;
}

export function ChangePlanModal({
  isOpen,
  onClose,
  accountId,
  currentPlanId,
  currentPlanName,
  currentPriceCents,
}: ChangePlanModalProps) {
  const router = useRouter();
  const [newPlanId, setNewPlanId] = useState("");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
  const [leadLimit, setLeadLimit] = useState("");
  const [prorate, setProrate] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allPlans = Object.values(PLANS);
  const selectedPlan = newPlanId ? PLANS[newPlanId] : null;

  // Calculate preview price
  let previewPrice = 0;
  if (selectedPlan) {
    const pricing = getPriceForBillingPeriod(selectedPlan, billingPeriod);
    if (newPlanId === "enterprise" && leadLimit) {
      const qty = Math.ceil(parseInt(leadLimit) / 1000);
      previewPrice = billingPeriod === "annual" ? 100000 * qty : 10000 * qty;
    } else {
      previewPrice = pricing.amount_cents;
    }
  }

  async function handleSubmit() {
    if (!newPlanId) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/account/${accountId}/subscription`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_API_KEY}` },
        body: JSON.stringify({
          newPlanId,
          billingPeriod,
          leadLimit: newPlanId === "enterprise" && leadLimit ? parseInt(leadLimit) : undefined,
          prorate,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to change plan");
      }

      const data = await res.json();
      toast.success("Plan changed", {
        description: `Changed to ${data.plan.name} — $${(data.plan.priceCents / 100).toFixed(2)}/${billingPeriod === "annual" ? "yr" : "mo"}`,
      });
      onClose();
      router.refresh();
    } catch (err) {
      toast.error("Failed to change plan", {
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
            <h2 className="text-lg font-semibold text-primary">Change Plan</h2>
            <p className="mt-1 text-sm text-tertiary">
              Current: {currentPlanName} — ${(currentPriceCents / 100).toFixed(2)}/mo
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-primary">New Plan</label>
                <select
                  value={newPlanId}
                  onChange={(e) => setNewPlanId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs"
                >
                  <option value="">Select a plan...</option>
                  {allPlans.map((plan) => (
                    <option key={plan.id} value={plan.id} disabled={plan.id === currentPlanId}>
                      {plan.name} ({plan.type === "multisite" ? `${plan.site_limit} sites` : plan.lead_limit ? `${plan.lead_limit} leads` : "Custom"})
                      {plan.id === currentPlanId ? " (current)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <fieldset>
                <legend className="text-sm font-medium text-primary">Billing period</legend>
                <div className="mt-2 flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-secondary">
                    <input
                      type="radio"
                      name="billing"
                      checked={billingPeriod === "monthly"}
                      onChange={() => setBillingPeriod("monthly")}
                      className="accent-brand-primary"
                    />
                    Monthly
                  </label>
                  <label className="flex items-center gap-2 text-sm text-secondary">
                    <input
                      type="radio"
                      name="billing"
                      checked={billingPeriod === "annual"}
                      onChange={() => setBillingPeriod("annual")}
                      className="accent-brand-primary"
                      disabled={!selectedPlan?.annualPricing}
                    />
                    Annual
                    {!selectedPlan?.annualPricing && selectedPlan && (
                      <span className="text-xs text-tertiary">(not available)</span>
                    )}
                  </label>
                </div>
              </fieldset>

              {newPlanId === "enterprise" && (
                <div>
                  <label className="block text-sm font-medium text-primary">Lead Limit</label>
                  <input
                    type="number"
                    min={1000}
                    step={1000}
                    value={leadLimit}
                    onChange={(e) => setLeadLimit(e.target.value)}
                    placeholder="e.g. 5000"
                    className="mt-1 w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs"
                  />
                  <p className="mt-1 text-xs text-tertiary">$100 per 1,000 leads</p>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm text-secondary">
                <input
                  type="checkbox"
                  checked={prorate}
                  onChange={(e) => setProrate(e.target.checked)}
                  className="accent-brand-primary"
                />
                Prorate charges
              </label>

              {selectedPlan && previewPrice > 0 && (
                <div className="rounded-lg bg-secondary px-4 py-3">
                  <p className="text-sm font-medium text-primary">
                    New price: ${(previewPrice / 100).toFixed(2)}/{billingPeriod === "annual" ? "yr" : "mo"}
                  </p>
                </div>
              )}
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
                isDisabled={!newPlanId || newPlanId === currentPlanId}
              >
                Change Plan
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
