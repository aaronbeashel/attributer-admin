import { notFound } from "next/navigation";
import {
  getAccountById,
  getAccountEnrichment,
  getAccountUsers,
  getAccountSubscription,
  getAccountSites,
  getAccountEvents,
} from "@/lib/queries/account-detail";
import { AccountHeader } from "./_components/account-header";
import { UsersSection } from "./_components/users-section";
import { SubscriptionSection } from "./_components/subscription-section";
import { BillingSection } from "./_components/billing-section";
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

  const [users, subscription, sites, events, enrichment] = await Promise.all([
    getAccountUsers(account.id),
    getAccountSubscription(account.id),
    getAccountSites(account.id),
    getAccountEvents(account.id, 20),
    getAccountEnrichment(account.id),
  ]);

  // Prepare sites for the header (for block option in cancel modal)
  const siteDomains = (sites ?? [])
    .filter((s) => s.status === "active" && s.domain)
    .map((s) => ({ domain: s.domain! }));

  return (
    <div className="space-y-6">
      <AccountHeader account={account} subscription={subscription} sites={siteDomains} />
      <UsersSection users={users} account={account} />
      <SubscriptionSection accountId={account.id} subscription={subscription} />
      <BillingSection
        accountId={account.id}
        stripeCustomerId={subscription?.stripeCustomerId ?? null}
      />
      <SitesSection sites={sites} />
      <AttributionSection account={account} />
      <EnrichmentSection accountId={account.id} enrichment={enrichment} />
      <ActivityTimeline events={events} />
    </div>
  );
}
