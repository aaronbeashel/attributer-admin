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
  const [isLoading, setIsLoading] = useState(!!stripeCustomerId);
  const [selectedCharge, setSelectedCharge] = useState<Charge | null>(null);

  useEffect(() => {
    if (!stripeCustomerId) return;

    let cancelled = false;
    fetch(`/api/account/${accountId}/charges`, {
      headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_API_KEY}` },
    })
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setCharges(data.charges || []); })
      .catch(() => { if (!cancelled) setCharges([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [accountId, stripeCustomerId]);

  if (!stripeCustomerId) {
    return null;
  }

  return (
    <>
      <div className="rounded-xl border border-secondary bg-primary">
        <div className="border-b border-secondary px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="text-lg font-semibold text-primary">Billing</h2>
        </div>

        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-tertiary sm:px-6">Loading charges...</div>
        ) : charges.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-tertiary sm:px-6">No charges found</div>
        ) : (
          <>
            {/* Mobile Card List */}
            <div className="divide-y divide-secondary sm:hidden">
              {charges.map((charge) => {
                const refundable = charge.status === "succeeded" && !charge.refunded;
                return (
                  <div key={charge.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-primary">
                          ${(charge.amount / 100).toFixed(2)} {charge.currency.toUpperCase()}
                        </p>
                        <p className="mt-0.5 text-xs text-quaternary">
                          {new Date(charge.created * 1000).toLocaleDateString()}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge
                            color={charge.status === "succeeded" ? "success" : charge.status === "failed" ? "error" : "gray"}
                            size="sm"
                          >
                            {charge.status}
                          </Badge>
                          {charge.refunded && (
                            <Badge color="warning" size="sm">Fully refunded</Badge>
                          )}
                          {!charge.refunded && charge.amountRefunded > 0 && (
                            <span className="text-xs text-tertiary">
                              ${(charge.amountRefunded / 100).toFixed(2)} refunded
                            </span>
                          )}
                        </div>
                      </div>
                      {refundable && (
                        <Button
                          color="secondary-destructive"
                          size="sm"
                          onClick={() => setSelectedCharge(charge)}
                        >
                          Refund
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto sm:block">
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
          </>
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
