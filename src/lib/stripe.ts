import Stripe from "stripe";

const STRIPE_DASHBOARD_BASE = "https://dashboard.stripe.com";

let _stripe: Stripe | null = null;

export function getStripeServer(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      typescript: true,
    });
  }
  return _stripe;
}

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

// --- Customer operations ---

export async function updateStripeCustomer(params: {
  customerId: string;
  name?: string;
  email?: string;
  metadata?: Record<string, string>;
}): Promise<void> {
  const stripe = getStripeServer();
  const update: Record<string, unknown> = {};
  if (params.name !== undefined) update.name = params.name;
  if (params.email !== undefined) update.email = params.email;
  if (params.metadata !== undefined) update.metadata = params.metadata;

  await stripe.customers.update(params.customerId, update);
}

export async function getDefaultPaymentMethod(
  customerId: string
): Promise<{ brand: string; last4: string; expMonth: number; expYear: number } | null> {
  const stripe = getStripeServer();
  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ["invoice_settings.default_payment_method"],
    });

    if (customer.deleted) return null;

    const pm = customer.invoice_settings?.default_payment_method;
    if (!pm || typeof pm === "string" || pm.type !== "card" || !pm.card) return null;

    return {
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
    };
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "resource_missing") return null;
    throw err;
  }
}

// --- Subscription operations ---

export async function cancelSubscription(
  subscriptionId: string,
  atPeriodEnd: boolean = true
): Promise<Stripe.Subscription> {
  const stripe = getStripeServer();

  if (atPeriodEnd) {
    return stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  }

  return stripe.subscriptions.cancel(subscriptionId);
}

export async function updateSubscriptionPlan(params: {
  subscriptionId: string;
  newPriceId: string;
  quantity?: number;
  prorate?: boolean;
}): Promise<Stripe.Subscription> {
  const stripe = getStripeServer();

  const subscription = await stripe.subscriptions.retrieve(params.subscriptionId);
  const itemId = subscription.items.data[0]?.id;

  if (!itemId) {
    throw new Error("No subscription item found");
  }

  return stripe.subscriptions.update(params.subscriptionId, {
    items: [
      {
        id: itemId,
        price: params.newPriceId,
        ...(params.quantity ? { quantity: params.quantity } : {}),
      },
    ],
    proration_behavior: params.prorate !== false ? "create_prorations" : "none",
    cancel_at_period_end: false,
  });
}

// --- Invoice operations ---

export async function listInvoices(customerId: string): Promise<
  Array<{
    id: string;
    date: number;
    amountPaid: number;
    status: string;
    hostedUrl: string | null;
    pdfUrl: string | null;
  }>
> {
  const stripe = getStripeServer();
  try {
    const invoices = await stripe.invoices.list({ customer: customerId, limit: 24 });
    return invoices.data.map((inv) => ({
      id: inv.id,
      date: inv.created,
      amountPaid: inv.amount_paid,
      status: inv.status ?? "unknown",
      hostedUrl: inv.hosted_invoice_url ?? null,
      pdfUrl: inv.invoice_pdf ?? null,
    }));
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "resource_missing") return [];
    throw err;
  }
}

// --- Charge operations ---

export async function listCharges(customerId: string): Promise<
  Array<{
    id: string;
    amount: number;
    amountRefunded: number;
    currency: string;
    status: string;
    created: number;
    description: string | null;
    refunded: boolean;
    invoiceId: string | null;
  }>
> {
  const stripe = getStripeServer();
  try {
    const charges = await stripe.charges.list({
      customer: customerId,
      limit: 24,
    });
    return charges.data.map((charge) => ({
      id: charge.id,
      amount: charge.amount,
      amountRefunded: charge.amount_refunded,
      currency: charge.currency,
      status: charge.status,
      created: charge.created,
      description: charge.description,
      refunded: charge.refunded,
      invoiceId: (charge as unknown as { invoice?: string | null }).invoice ?? null,
    }));
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "resource_missing") return [];
    throw err;
  }
}

// --- Refund operations ---

export async function createRefund(params: {
  chargeId: string;
  amount?: number; // in cents — omit for full refund
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
  metadata?: Record<string, string>;
}): Promise<Stripe.Refund> {
  const stripe = getStripeServer();
  return stripe.refunds.create({
    charge: params.chargeId,
    ...(params.amount ? { amount: params.amount } : {}),
    reason: params.reason || "requested_by_customer",
    metadata: params.metadata || {},
  });
}
