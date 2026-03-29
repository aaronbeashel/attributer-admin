"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { RefundModal } from "./actions/refund-modal";

interface Charge {
  id: string;
  amount: number;
  amountRefunded: number;
  currency: string;
  status: string;
  created: number;
  description: string | null;
  refunded: boolean;
}

interface BillingSectionProps {
  accountId: string;
  stripeCustomerId: string | null;
}

export function BillingSection({ accountId, stripeCustomerId }: BillingSectionProps) {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCharge, setSelectedCharge] = useState<Charge | null>(null);

  useEffect(() => {
    if (!stripeCustomerId) {
      setIsLoading(false);
      return;
    }

    fetch(`/api/account/${accountId}/charges`, {
      headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_API_KEY}` },
    })
      .then((res) => res.json())
      .then((data) => setCharges(data.charges || []))
      .catch(() => setCharges([]))
      .finally(() => setIsLoading(false));
  }, [accountId, stripeCustomerId]);

  if (!stripeCustomerId) {
    return null;
  }

  return (
    <>
      <div className="rounded-xl border border-secondary bg-primary">
        <div className="border-b border-secondary px-6 py-4">
          <h2 className="text-lg font-semibold text-primary">Billing</h2>
        </div>

        {isLoading ? (
          <div className="px-6 py-8 text-center text-sm text-tertiary">Loading charges...</div>
        ) : charges.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-tertiary">No charges found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-secondary bg-secondary">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Refunded</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-quaternary">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary">
                {charges.map((charge) => {
                  const refundable = charge.status === "succeeded" && !charge.refunded;
                  return (
                    <tr key={charge.id}>
                      <td className="px-6 py-4 text-sm text-primary whitespace-nowrap">
                        {new Date(charge.created * 1000).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-primary">
                        ${(charge.amount / 100).toFixed(2)} {charge.currency.toUpperCase()}
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          color={charge.status === "succeeded" ? "success" : charge.status === "failed" ? "error" : "gray"}
                          size="sm"
                        >
                          {charge.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-tertiary">
                        {charge.amountRefunded > 0
                          ? `$${(charge.amountRefunded / 100).toFixed(2)}`
                          : "—"}
                        {charge.refunded && (
                          <Badge color="warning" size="sm" className="ml-2">
                            Fully refunded
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {refundable && (
                          <Button
                            color="secondary-destructive"
                            size="sm"
                            onClick={() => setSelectedCharge(charge)}
                          >
                            Refund
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedCharge && (
        <RefundModal
          isOpen={!!selectedCharge}
          onClose={() => setSelectedCharge(null)}
          accountId={accountId}
          charge={selectedCharge}
        />
      )}
    </>
  );
}
