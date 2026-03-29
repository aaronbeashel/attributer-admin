export const MOCK_ACCOUNT = {
  id: "acc_123",
  name: "Test User",
  email: "test@example.com",
  company: "Test Corp",
  betterauth_user_id: "user_456",
  signup_method: "email",
  created_at: "2025-01-15T00:00:00Z",
  cancelled_at: null,
};

export const MOCK_SUBSCRIPTION_ACTIVE = {
  id: "sub_local_1",
  account_id: "acc_123",
  stripe_customer_id: "cus_stripe_123",
  stripe_subscription_id: "sub_stripe_123",
  plan_id: "starter",
  plan_name: "Starter",
  plan_price_cents: 4900,
  plan_currency: "usd",
  status: "active",
  trial_type: null,
  trial_ends_at: null,
  site_limit: 1,
  lead_limit: 500,
  current_period_start: "2025-03-01T00:00:00Z",
  current_period_end: "2025-04-01T00:00:00Z",
  delinquent_since: null,
  cancellation_reason: null,
  cancellation_feedback: null,
  created_at: "2025-01-15T00:00:00Z",
  updated_at: "2025-03-01T00:00:00Z",
};

export const MOCK_SUBSCRIPTION_TRIALING = {
  ...MOCK_SUBSCRIPTION_ACTIVE,
  id: "sub_local_trial",
  status: "trialing",
  trial_type: "cardless",
  trial_ends_at: "2025-04-15T00:00:00Z",
  stripe_subscription_id: "sub_stripe_trial",
};

export const MOCK_SUBSCRIPTION_CANCELLED = {
  ...MOCK_SUBSCRIPTION_ACTIVE,
  id: "sub_local_cancelled",
  status: "cancelled",
  cancellation_reason: "Too expensive",
  cancellation_feedback: "Looking for cheaper options",
};

export const MOCK_SUBSCRIPTION_NO_STRIPE = {
  ...MOCK_SUBSCRIPTION_ACTIVE,
  id: "sub_local_no_stripe",
  stripe_customer_id: null,
  stripe_subscription_id: null,
};

export const MOCK_ACCOUNT_WITH_SUB = {
  account: MOCK_ACCOUNT,
  subscription: MOCK_SUBSCRIPTION_ACTIVE,
};

export const MOCK_ACCOUNT_WITH_TRIAL = {
  account: MOCK_ACCOUNT,
  subscription: MOCK_SUBSCRIPTION_TRIALING,
};

export const MOCK_ACCOUNT_CANCELLED = {
  account: { ...MOCK_ACCOUNT, cancelled_at: "2025-03-15T00:00:00Z" },
  subscription: MOCK_SUBSCRIPTION_CANCELLED,
};

export const MOCK_CHARGE = {
  id: "ch_123",
  amount: 4900,
  amountRefunded: 0,
  currency: "usd",
  status: "succeeded",
  created: 1711929600,
  description: "Subscription payment",
  refunded: false,
  invoiceId: "in_123",
};

export const MOCK_CHARGE_REFUNDED = {
  ...MOCK_CHARGE,
  id: "ch_refunded",
  refunded: true,
  amountRefunded: 4900,
};

export const MOCK_CHARGE_PARTIAL = {
  ...MOCK_CHARGE,
  id: "ch_partial",
  amountRefunded: 2000,
};
