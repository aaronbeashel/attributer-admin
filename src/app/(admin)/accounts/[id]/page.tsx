import { notFound } from "next/navigation";
import {
  getAccountById,
  getAccountUsers,
  getAccountSubscription,
  getAccountSites,
  getAccountEvents,
} from "@/lib/queries/account-detail";
import { AccountHeader } from "./_components/account-header";
import { UsersSection } from "./_components/users-section";
import { SubscriptionSection } from "./_components/subscription-section";
import { SitesSection } from "./_components/sites-section";
import { AttributionSection } from "./_components/attribution-section";
import { EnrichmentSection } from "./_components/enrichment-section";
import { ActivityTimeline } from "./_components/activity-timeline";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const account = await getAccountById(id);
  if (!account) notFound();

  const [users, subscription, sites, events] = await Promise.all([
    getAccountUsers(account.betterauthUserId),
    getAccountSubscription(account.id),
    getAccountSites(account.id),
    getAccountEvents(account.id, 20),
  ]);

  return (
    <div className="space-y-6">
      <AccountHeader account={account} subscription={subscription} />
      <UsersSection users={users} account={account} />
      <SubscriptionSection subscription={subscription} />
      <SitesSection sites={sites} />
      <AttributionSection account={account} />
      <EnrichmentSection account={account} />
      <ActivityTimeline events={events} />
    </div>
  );
}
