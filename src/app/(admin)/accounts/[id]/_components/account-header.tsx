import { Badge } from "@/components/base/badges/badges";
import type { AccountDetail, AccountSubscription } from "@/lib/queries/account-detail";
import { formatDate } from "@/lib/utils/format";
import { STATUS_COLORS } from "@/lib/utils/constants";

interface AccountHeaderProps {
  account: AccountDetail;
  subscription: AccountSubscription | null;
}

export function AccountHeader({ account, subscription }: AccountHeaderProps) {
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
    </div>
  );
}
