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
      <div className="border-b border-secondary px-4 py-3 sm:px-6 sm:py-4">
        <h2 className="text-lg font-semibold text-primary">Users</h2>
      </div>
      {/* Mobile Card List */}
      <div className="divide-y divide-secondary sm:hidden">
        {users.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-tertiary">No users found</p>
        ) : (
          users.map((user) => (
            <div key={user.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary">{user.name}</p>
                  <p className="mt-0.5 truncate text-sm text-tertiary">{user.email}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge color="gray" size="sm">{user.role}</Badge>
                    <Badge color="gray" size="sm">
                      {account.signupMethod === "google" ? "Google" : "Email"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-quaternary">
                    Joined {formatDate(user.createdAt)} · Active {formatRelativeTime(user.updatedAt)}
                  </p>
                </div>
                <div className="shrink-0">
                  <UserActions accountId={account.id} userEmail={user.email} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-secondary bg-secondary">
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Name</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Email</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Role</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Joined</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Last Active</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-quaternary">Signup</th>
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
                      {user.role}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-sm text-tertiary">{formatDate(user.createdAt)}</td>
                  <td className="px-6 py-4 text-sm text-tertiary">{formatRelativeTime(user.updatedAt)}</td>
                  <td className="px-6 py-4">
                    <Badge color="gray" size="sm">
                      {account.signupMethod === "google" ? "Google" : "Email"}
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
