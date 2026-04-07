import { Badge } from "@/components/base/badges/badges";
import type { AccountSubscription } from "@/lib/queries/account-detail";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { getStripeDashboardUrl } from "@/lib/stripe";
import { STATUS_COLORS } from "@/lib/utils/constants";
import { SubscriptionActions } from "./subscription-actions";

interface SubscriptionSectionProps {
  accountId: string;
  subscription: AccountSubscription | null;
}

function Field({ label, value, href }: { label: string; value: string | null; href?: string }) {
  return (
    <div>
      <dt className="text-sm text-tertiary">{label}</dt>
      <dd className="mt-1 break-all text-sm font-medium text-primary">
        {href && value ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">
            {value}
          </a>
        ) : (
          value || "—"
        )}
      </dd>
    </div>
  );
}

export function SubscriptionSection({ accountId, subscription }: SubscriptionSectionProps) {
  if (!subscription) {
    return (
      <div className="rounded-xl border border-secondary bg-primary px-6 py-8 text-center">
        <p className="text-sm text-tertiary">No subscription found</p>
      </div>
    );
  }

  const isCancelled = subscription.status === "cancelled" || subscription.cancellationReason;

  return (
    <div className="rounded-xl border border-secondary bg-primary">
      <div className="border-b border-secondary px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-primary">Subscription</h2>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Badge color={STATUS_COLORS[subscription.status] ?? "gray"} size="md">
              {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
            </Badge>
            <SubscriptionActions
              accountId={accountId}
              planId={subscription.planId}
              planName={subscription.planName}
              planPriceCents={subscription.planPriceCents}
              status={subscription.status}
              trialEndsAt={subscription.trialEndsAt}
            />
          </div>
        </div>
      </div>

      {isCancelled && (
        <div className="border-b border-error-secondary bg-error-secondary px-4 py-3 sm:px-6">
          <p className="text-sm font-medium text-error-primary">
            Cancelled{subscription.cancellationReason ? `: ${subscription.cancellationReason}` : ""}
          </p>
          {subscription.cancellationFeedback && (
            <p className="mt-1 text-sm text-error-primary opacity-80">{subscription.cancellationFeedback}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 sm:gap-6 sm:px-6 sm:py-5 lg:grid-cols-3">
        <Field label="Plan" value={subscription.planName} />
        <Field label="Price" value={formatCurrency(subscription.planPriceCents, subscription.planCurrency)} />
        <Field label="Trial Type" value={subscription.trialType} />
        <Field label="Trial Ends" value={formatDate(subscription.trialEndsAt)} />
        <Field label="Site Limit" value={String(subscription.siteLimit)} />
        <Field label="Lead Limit" value={subscription.leadLimit ? String(subscription.leadLimit) : "Unlimited"} />
        <Field label="Current Period Start" value={formatDate(subscription.currentPeriodStart)} />
        <Field label="Current Period End" value={formatDate(subscription.currentPeriodEnd)} />
        <Field label="Delinquent Since" value={formatDate(subscription.delinquentSince)} />
        <Field
          label="Stripe Customer"
          value={subscription.stripeCustomerId}
          href={subscription.stripeCustomerId ? getStripeDashboardUrl("customer", subscription.stripeCustomerId) : undefined}
        />
        <Field
          label="Stripe Subscription"
          value={subscription.stripeSubscriptionId}
          href={subscription.stripeSubscriptionId ? getStripeDashboardUrl("subscription", subscription.stripeSubscriptionId) : undefined}
        />
        <Field label="Created" value={formatDate(subscription.createdAt)} />
      </div>
    </div>
  );
}
