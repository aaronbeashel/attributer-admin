import { Badge } from "@/components/base/badges/badges";
import type { AccountDetail, AccountSubscription } from "@/lib/queries/account-detail";
import { formatDate } from "@/lib/utils/format";
import { STATUS_COLORS } from "@/lib/utils/constants";
import { AccountActions } from "./account-actions";

interface AccountHeaderProps {
  account: AccountDetail;
  subscription: AccountSubscription | null;
  sites: Array<{ domain: string }>;
}

export function AccountHeader({ account, subscription, sites }: AccountHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-display-xs font-semibold text-primary">
            {account.company || account.name}
          </h1>
          {subscription && (
            <Badge
              color={STATUS_COLORS[subscription.status] ?? "gray"}
              size="md"
            >
              {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
            </Badge>
          )}
        </div>
        <div className="mt-1 flex items-center gap-4 text-sm text-tertiary">
          <span>{account.email}</span>
          <span>ID: {account.id.slice(0, 8)}...</span>
          <span>Created {formatDate(account.createdAt)}</span>
        </div>
      </div>

      <AccountActions
        accountId={account.id}
        companyName={account.company || account.name}
        email={account.email}
        currentPeriodEnd={subscription?.currentPeriodEnd ?? null}
        sites={sites}
      />
    </div>
  );
}
