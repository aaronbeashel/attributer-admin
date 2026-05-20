"use client";

import { useState, useEffect } from "react";
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

interface Coupon {
  id: string;
  name: string | null;
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  duration: string;
  durationInMonths: number | null;
}

interface ExistingDiscount {
  couponId: string;
  couponName: string | null;
  percentOff: number | null;
  amountOff: number | null;
}

function formatCoupon(c: Coupon): string {
  const value = c.percentOff ? `${c.percentOff}% off` : c.amountOff ? `$${(c.amountOff / 100).toFixed(2)} off` : "";
  const duration = c.duration === "forever" ? "forever" : c.duration === "once" ? "once" : c.durationInMonths ? `${c.durationInMonths} months` : "";
  return `${c.name || c.id} — ${value} (${duration})`;
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
  const [couponId, setCouponId] = useState("");
  const [siteLimit, setSiteLimit] = useState("");
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [existingDiscount, setExistingDiscount] = useState<ExistingDiscount | null>(null);
  const [isLoadingCoupons, setIsLoadingCoupons] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allPlans = Object.values(PLANS);
  const selectedPlan = newPlanId ? PLANS[newPlanId] : null;
  const isMultisite = selectedPlan?.type === "multisite";
  const selectedCoupon = couponId ? coupons.find((c) => c.id === couponId) : null;

  // Load coupons + existing discount when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setIsLoadingCoupons(true);
    Promise.all([
      fetch("/api/stripe/coupons", {
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_API_KEY}` },
      })
        .then((res) => res.json())
        .then((data) => setCoupons(data.coupons || []))
        .catch(() => toast.error("Failed to load coupons")),
      fetch(`/api/account/${accountId}/subscription`, {
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_API_KEY}` },
      })
        .then((res) => res.json())
        .then((data) => setExistingDiscount(data?.stripe?.discount ?? null))
        .catch(() => setExistingDiscount(null)),
    ]).finally(() => setIsLoadingCoupons(false));
  }, [isOpen, accountId]);

  function handlePlanChange(planId: string) {
    setNewPlanId(planId);
    const plan = planId ? PLANS[planId] : null;
    if (plan?.type === "multisite") {
      setSiteLimit(String(plan.site_limit));
    } else {
      setSiteLimit("");
    }
  }

  function handleClose() {
    setNewPlanId("");
    setLeadLimit("");
    setProrate(true);
    setCouponId("");
    setSiteLimit("");
    onClose();
  }

  // Calculate preview price (list price for the plan)
  let listPrice = 0;
  if (selectedPlan) {
    const pricing = getPriceForBillingPeriod(selectedPlan, billingPeriod);
    if (newPlanId === "enterprise" && leadLimit) {
      const qty = Math.ceil(parseInt(leadLimit) / 1000);
      listPrice = billingPeriod === "annual" ? 100000 * qty : 10000 * qty;
    } else {
      listPrice = pricing.amount_cents;
    }
  }

  // Apply coupon to preview price
  let discountedPrice = listPrice;
  if (selectedCoupon && listPrice > 0) {
    if (selectedCoupon.percentOff) {
      discountedPrice = Math.round(listPrice * (1 - selectedCoupon.percentOff / 100));
    } else if (selectedCoupon.amountOff) {
      discountedPrice = Math.max(0, listPrice - selectedCoupon.amountOff);
    }
  }

  async function handleSubmit() {
    if (!newPlanId) return;

    // Validate site limit if multisite
    let siteLimitNum: number | undefined;
    if (isMultisite) {
      siteLimitNum = parseInt(siteLimit);
      if (!Number.isInteger(siteLimitNum) || siteLimitNum < 1) {
        toast.error("Site limit must be a positive whole number");
        return;
      }
    }

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
          couponId: couponId || undefined,
          siteLimit: siteLimitNum,
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
      handleClose();
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
    <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && handleClose()} isDismissable>
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
                  onChange={(e) => handlePlanChange(e.target.value)}
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

              {isMultisite && selectedPlan && (
                <div>
                  <label className="block text-sm font-medium text-primary">Site Limit</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={siteLimit}
                    onChange={(e) => setSiteLimit(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs"
                  />
                  <p className="mt-1 text-xs text-tertiary">
                    Plan default: {selectedPlan.site_limit}. Override to grant a custom site allowance.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-primary">Discount (optional)</label>
                {isLoadingCoupons ? (
                  <p className="mt-2 text-sm text-tertiary">Loading coupons...</p>
                ) : (
                  <select
                    value={couponId}
                    onChange={(e) => setCouponId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs"
                  >
                    <option value="">No discount</option>
                    {coupons.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatCoupon(c)}
                      </option>
                    ))}
                  </select>
                )}
                {couponId && existingDiscount && existingDiscount.couponId !== couponId && (
                  <p className="mt-2 rounded-md bg-warning-secondary px-3 py-2 text-xs text-warning-primary">
                    This will replace the existing discount: {existingDiscount.couponName || existingDiscount.couponId}
                    {existingDiscount.percentOff ? ` (${existingDiscount.percentOff}% off)` : existingDiscount.amountOff ? ` ($${(existingDiscount.amountOff / 100).toFixed(2)} off)` : ""}
                  </p>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm text-secondary">
                <input
                  type="checkbox"
                  checked={prorate}
                  onChange={(e) => setProrate(e.target.checked)}
                  className="accent-brand-primary"
                />
                Prorate charges
              </label>

              {selectedPlan && listPrice > 0 && (
                <div className="rounded-lg bg-secondary px-4 py-3">
                  {selectedCoupon && discountedPrice !== listPrice ? (
                    <>
                      <p className="text-sm text-tertiary line-through">
                        ${(listPrice / 100).toFixed(2)}/{billingPeriod === "annual" ? "yr" : "mo"}
                      </p>
                      <p className="text-sm font-medium text-primary">
                        New price after discount: ${(discountedPrice / 100).toFixed(2)}/{billingPeriod === "annual" ? "yr" : "mo"}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm font-medium text-primary">
                      New price: ${(listPrice / 100).toFixed(2)}/{billingPeriod === "annual" ? "yr" : "mo"}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button color="secondary" size="md" onClick={handleClose}>
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
