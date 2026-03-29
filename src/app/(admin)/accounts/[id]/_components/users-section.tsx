import { Badge } from "@/components/base/badges/badges";
import type { AccountUser, AccountDetail } from "@/lib/queries/account-detail";
import { formatDate, formatRelativeTime } from "@/lib/utils/format";
import { UserActions } from "./user-actions";

interface UsersSectionProps {
  users: AccountUser[];
  account: AccountDetail;
}

export function UsersSection({ users, account }: UsersSectionProps) {
  return (
    <div className="rounded-xl border border-secondary bg-primary">
      <div className="border-b border-secondary px-6 py-4">
        <h2 className="text-lg font-semibold text-primary">Users</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-secondary bg-secondary">
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Name</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Email</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Signup Method</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Joined</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Last Active</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Verified</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-quaternary">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-sm text-tertiary">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 text-sm font-medium text-primary">{user.name}</td>
                  <td className="px-6 py-4 text-sm text-tertiary">{user.email}</td>
                  <td className="px-6 py-4">
                    <Badge color="gray" size="sm">
                      {account.signupMethod}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-sm text-tertiary">{formatDate(user.createdAt)}</td>
                  <td className="px-6 py-4 text-sm text-tertiary">{formatRelativeTime(user.updatedAt)}</td>
                  <td className="px-6 py-4">
                    <Badge color={user.emailVerified ? "success" : "warning"} size="sm">
                      {user.emailVerified ? "Verified" : "Unverified"}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <UserActions accountId={account.id} userEmail={user.email} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
