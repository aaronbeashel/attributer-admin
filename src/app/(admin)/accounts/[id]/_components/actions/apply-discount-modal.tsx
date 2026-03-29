"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ModalOverlay, Modal, Dialog } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";

interface Coupon {
  id: string;
  name: string | null;
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  duration: string;
  durationInMonths: number | null;
}

interface ApplyDiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
}

function formatCoupon(c: Coupon): string {
  const value = c.percentOff ? `${c.percentOff}% off` : c.amountOff ? `$${(c.amountOff / 100).toFixed(2)} off` : "";
  const duration = c.duration === "forever" ? "forever" : c.duration === "once" ? "once" : c.durationInMonths ? `${c.durationInMonths} months` : "";
  return `${c.name || c.id} — ${value} (${duration})`;
}

export function ApplyDiscountModal({ isOpen, onClose, accountId }: ApplyDiscountModalProps) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetch("/api/stripe/coupons", {
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_API_KEY}` },
      })
        .then((res) => res.json())
        .then((data) => setCoupons(data.coupons || []))
        .catch(() => toast.error("Failed to load coupons"))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  async function handleSubmit() {
    if (!selectedCouponId) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/account/${accountId}/discount`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_API_KEY}` },
        body: JSON.stringify({ couponId: selectedCouponId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to apply discount");
      }

      const coupon = coupons.find((c) => c.id === selectedCouponId);
      toast.success("Discount applied", {
        description: coupon ? `Applied: ${coupon.name || coupon.id}` : "Coupon applied",
      });
      onClose();
      setSelectedCouponId("");
    } catch (err) {
      toast.error("Failed to apply discount", {
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
            <h2 className="text-lg font-semibold text-primary">Apply Discount</h2>
            <p className="mt-1 text-sm text-tertiary">
              This replaces any existing discount on the subscription.
            </p>

            <div className="mt-5">
              <label className="block text-sm font-medium text-primary">Coupon</label>
              {isLoading ? (
                <p className="mt-2 text-sm text-tertiary">Loading coupons...</p>
              ) : (
                <select
                  value={selectedCouponId}
                  onChange={(e) => setSelectedCouponId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs"
                >
                  <option value="">Select a coupon...</option>
                  {coupons.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatCoupon(c)}
                    </option>
                  ))}
                </select>
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
                isDisabled={!selectedCouponId}
              >
                Apply Discount
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
