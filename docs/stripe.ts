import Stripe from "stripe";
import { createLogger } from "@/lib/logger";

const log = createLogger("stripe");

let _stripe: Stripe | null = null;

export function getStripeServer(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      typescript: true,
    });
  }
  return _stripe;
}

export async function createStripeCustomer(params: {
  email: string;
  name: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Customer> {
  log.info({ email: params.email }, "Creating Stripe customer");
  const customer = await getStripeServer().customers.create({
    email: params.email,
    name: params.name,
    metadata: params.metadata || {},
  });
  log.info({ customerId: customer.id }, "Stripe customer created");
  return customer;
}

export async function createSetupIntent(
  customerId?: string
): Promise<Stripe.SetupIntent> {
  log.info({ customerId: customerId ?? "none" }, "Creating SetupIntent");
  const setupIntent = await getStripeServer().setupIntents.create({
    ...(customerId ? { customer: customerId } : {}),
    automatic_payment_methods: { enabled: true },
  });
  return setupIntent;
}

export async function attachPaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<void> {
  log.info({ customerId }, "Attaching payment method");
  const stripe = getStripeServer();

  // Check if the PM is already attached to avoid "already attached" errors
  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);

  if (pm.customer && typeof pm.customer === "string") {
    if (pm.customer === customerId) {
      // Already on the right customer — just set as default
      log.info({ customerId }, "Payment method already attached, setting as default");
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
      return;
    }
    // Attached to a different customer — detach first
    log.info({ oldCustomerId: pm.customer, newCustomerId: customerId }, "Detaching PM from old customer");
    await stripe.paymentMethods.detach(paymentMethodId);
  }

  await stripe.paymentMethods.attach(paymentMethodId, {
    customer: customerId,
  });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
}

export async function createSubscription(params: {
  customerId: string;
  priceId: string;
  trialDays: number;
  paymentMethodId?: string;
  quantity?: number;
  metadata?: Record<string, string>;
}): Promise<Stripe.Subscription> {
  log.info(
    { customerId: params.customerId, priceId: params.priceId },
    "Creating Stripe subscription"
  );

  const subscriptionParams: Stripe.SubscriptionCreateParams = {
    customer: params.customerId,
    items: [
      {
        price: params.priceId,
        ...(params.quantity ? { quantity: params.quantity } : {}),
      },
    ],
    trial_period_days: params.trialDays,
    metadata: params.metadata || {},
  };

  if (params.paymentMethodId) {
    subscriptionParams.default_payment_method = params.paymentMethodId;
  } else {
    subscriptionParams.payment_behavior = "default_incomplete";
  }

  const subscription =
    await getStripeServer().subscriptions.create(subscriptionParams);
  log.info(
    { subscriptionId: subscription.id, status: subscription.status },
    "Stripe subscription created"
  );
  return subscription;
}

export async function cancelSubscription(
  subscriptionId: string,
  atPeriodEnd: boolean = true
): Promise<Stripe.Subscription> {
  log.info({ subscriptionId, atPeriodEnd }, "Cancelling Stripe subscription");
  const stripe = getStripeServer();

  if (atPeriodEnd) {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    log.info(
      { subscriptionId, status: subscription.status },
      "Stripe subscription set to cancel at period end"
    );
    return subscription;
  }

  const subscription = await stripe.subscriptions.cancel(subscriptionId);
  log.info(
    { subscriptionId, status: subscription.status },
    "Stripe subscription cancelled immediately"
  );
  return subscription;
}

export async function updateSubscriptionPlan(params: {
  subscriptionId: string;
  newPriceId: string;
  quantity?: number;
  prorate?: boolean;
}): Promise<Stripe.Subscription> {
  log.info(
    { subscriptionId: params.subscriptionId, newPriceId: params.newPriceId },
    "Updating Stripe subscription plan"
  );
  const stripe = getStripeServer();

  const subscription = await stripe.subscriptions.retrieve(
    params.subscriptionId
  );
  const itemId = subscription.items.data[0]?.id;

  if (!itemId) {
    throw new Error("No subscription item found");
  }

  const updated = await stripe.subscriptions.update(params.subscriptionId, {
    items: [
      {
        id: itemId,
        price: params.newPriceId,
        ...(params.quantity ? { quantity: params.quantity } : {}),
      },
    ],
    proration_behavior:
      params.prorate !== false ? "create_prorations" : "none",
    cancel_at_period_end: false,
  });

  log.info(
    { subscriptionId: updated.id, status: updated.status },
    "Stripe subscription plan updated"
  );
  return updated;
}

export async function retryOpenInvoices(
  customerId: string,
  paymentMethodId: string
): Promise<void> {
  const stripe = getStripeServer();
  const openInvoices = await stripe.invoices.list({ customer: customerId, status: "open" });

  for (const invoice of openInvoices.data) {
    try {
      await stripe.invoices.pay(invoice.id, { payment_method: paymentMethodId });
      log.info({ customerId, invoiceId: invoice.id }, "Open invoice retried after card update");
    } catch (err) {
      const stripeErr = err as Stripe.errors.StripeError;
      if (stripeErr.code === "invoice_already_paid") continue;
      log.warn({ customerId, invoiceId: invoice.id, code: stripeErr.code }, "Invoice retry failed after card update");
    }
  }
}

export async function updateDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<void> {
  log.info({ customerId }, "Updating default payment method");
  const stripe = getStripeServer();

  await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  await retryOpenInvoices(customerId, paymentMethodId);

  log.info({ customerId }, "Default payment method updated");
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
    // Customer doesn't exist in Stripe (e.g. test/seed accounts with fake IDs)
    if ((err as { code?: string })?.code === "resource_missing") return null;
    throw err;
  }
}

export async function updateStripeCustomer(params: {
  customerId: string;
  name?: string;
  email?: string;
  metadata?: Record<string, string>;
}): Promise<void> {
  const stripe = getStripeServer();
  log.info({ customerId: params.customerId }, "Updating Stripe customer");

  const update: Record<string, unknown> = {};
  if (params.name !== undefined) update.name = params.name;
  if (params.email !== undefined) update.email = params.email;
  if (params.metadata !== undefined) update.metadata = params.metadata;

  await stripe.customers.update(params.customerId, update);
  log.info({ customerId: params.customerId }, "Stripe customer updated");
}

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
    // Customer doesn't exist in Stripe (e.g. test/seed accounts with fake IDs)
    if ((err as { code?: string })?.code === "resource_missing") return [];
    throw err;
  }
}
