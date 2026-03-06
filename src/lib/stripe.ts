// Stripe helpers — stubbed until real key is provided

const STRIPE_DASHBOARD_BASE = "https://dashboard.stripe.com";

export function getStripeDashboardUrl(type: "customer" | "subscription" | "invoice", id: string): string {
  const isTest = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test");
  const base = isTest ? `${STRIPE_DASHBOARD_BASE}/test` : STRIPE_DASHBOARD_BASE;

  switch (type) {
    case "customer":
      return `${base}/customers/${id}`;
    case "subscription":
      return `${base}/subscriptions/${id}`;
    case "invoice":
      return `${base}/invoices/${id}`;
  }
}

// Stubbed Stripe functions — replace with real implementation when key is provided
export async function getStripeCustomer(customerId: string) {
  console.warn("[Stripe] Stubbed: getStripeCustomer", customerId);
  return null;
}

export async function getStripeSubscription(subscriptionId: string) {
  console.warn("[Stripe] Stubbed: getStripeSubscription", subscriptionId);
  return null;
}

export async function cancelStripeSubscription(subscriptionId: string) {
  console.warn("[Stripe] Stubbed: cancelStripeSubscription", subscriptionId);
  return { success: true, stubbed: true };
}

export async function updateStripeSubscription(subscriptionId: string, planId: string) {
  console.warn("[Stripe] Stubbed: updateStripeSubscription", subscriptionId, planId);
  return { success: true, stubbed: true };
}
