# Attributer Admin API Reference

Base URL: `https://admin.attributer.io` (or wherever the admin app is deployed)

## Authentication

All endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <ADMIN_API_KEY>
```

Returns `401 { error: "Unauthorized" }` if the key is missing or invalid.

---

## Lookup

### GET /api/account/by-email

Look up an account by email address. Use this as the entry point when you have a customer's email from a support ticket.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | Customer email address |

**Response (200):**
```json
{
  "accountId": "uuid",
  "email": "customer@example.com",
  "name": "Jane Smith",
  "company": "Acme Corp"
}
```

**Errors:** `400` email missing, `404` no account found

---

### GET /api/account/:id

Get full account details including subscription, payment method, owner, and sites.

**Response (200):**
```json
{
  "account": {
    "id": "uuid",
    "name": "Jane Smith",
    "email": "jane@acme.com",
    "company": "Acme Corp",
    "signupMethod": "email",
    "createdAt": "2025-01-15T00:00:00Z",
    "cancelledAt": null
  },
  "owner": {
    "name": "Jane Smith",
    "email": "jane@acme.com"
  },
  "subscription": {
    "id": "uuid",
    "status": "active",
    "planId": "starter",
    "planName": "Starter",
    "planPriceCents": 4900,
    "trialType": null,
    "trialEndsAt": null,
    "siteLimit": 1,
    "leadLimit": 500,
    "currentPeriodStart": "2025-03-01T00:00:00Z",
    "currentPeriodEnd": "2025-04-01T00:00:00Z",
    "delinquentSince": null,
    "stripeCustomerId": "cus_xxx",
    "stripeSubscriptionId": "sub_xxx"
  },
  "paymentMethod": {
    "brand": "visa",
    "last4": "4242",
    "expMonth": 12,
    "expYear": 2026
  },
  "sites": [
    { "id": "uuid", "name": "Main Site", "domain": "acme.com", "websiteUrl": "https://acme.com" }
  ]
}
```

`subscription`, `paymentMethod`, and `owner` can be `null`. `sites` can be empty array.

**Errors:** `404` account not found

---

## Billing

### GET /api/account/:id/charges

List recent Stripe charges for the account (up to 24).

**Response (200):**
```json
{
  "accountId": "uuid",
  "stripeCustomerId": "cus_xxx",
  "charges": [
    {
      "id": "ch_xxx",
      "amount": 4900,
      "amountRefunded": 0,
      "currency": "usd",
      "status": "succeeded",
      "created": 1711929600,
      "description": "Subscription payment",
      "refunded": false,
      "invoiceId": "in_xxx"
    }
  ]
}
```

`amount` and `amountRefunded` are in cents. `created` is a Unix timestamp.

**Errors:** `404` no Stripe customer found

---

### POST /api/account/:id/refund

Issue a full or partial refund on a Stripe charge.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| chargeId | string | Yes | Stripe charge ID (from charges endpoint) |
| amount | number | No | Refund amount in cents. Omit for full refund. |
| reason | string | No | Human-readable reason for the refund |
| supportCaseId | string | No | ID of the support case for audit trail |

**Response (200):**
```json
{
  "success": true,
  "refund": {
    "id": "re_xxx",
    "amount": 4900,
    "currency": "usd",
    "status": "succeeded",
    "chargeId": "ch_xxx"
  }
}
```

**Errors:**
- `400` chargeId missing, or refund amount exceeds refundable balance (response includes `refundable` field with max amount in cents)
- `404` account not found
- `409` charge already fully refunded

---

### POST /api/account/:id/credit

Apply account credit (reduces next invoice).

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| amount | number | Yes | Credit amount in cents (positive integer) |
| reason | string | No | Reason for the credit |
| supportCaseId | string | No | Support case ID |

**Response (200):**
```json
{
  "success": true,
  "credit": {
    "amount": 5000,
    "transactionId": "txn_xxx",
    "newBalanceCents": -5000
  }
}
```

`newBalanceCents` is negative when the customer has credit (Stripe convention).

**Important:** This is NOT idempotent — each call adds more credit. Track via `supportCaseId` to avoid duplicates.

**Errors:** `400` invalid amount, `404` no Stripe customer

---

### POST /api/account/:id/discount

Apply a Stripe coupon to the subscription. Replaces any existing discount.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| couponId | string | Yes | Stripe coupon ID (from coupons endpoint) |
| supportCaseId | string | No | Support case ID |

**Response (200):**
```json
{
  "success": true,
  "discount": {
    "couponId": "SAVE20",
    "couponName": "20% off",
    "percentOff": 20,
    "amountOff": null
  }
}
```

**Errors:** `400` couponId missing, `404` no active subscription

---

### GET /api/stripe/coupons

List all valid Stripe coupons (for populating a coupon picker).

**Response (200):**
```json
{
  "coupons": [
    {
      "id": "SAVE20",
      "name": "20% off",
      "percentOff": 20,
      "amountOff": null,
      "currency": null,
      "duration": "forever",
      "durationInMonths": null,
      "timesRedeemed": 5,
      "maxRedemptions": null
    }
  ]
}
```

`duration` is `"once"`, `"repeating"`, or `"forever"`. For `"repeating"`, `durationInMonths` is set.

---

## Subscription Management

### GET /api/account/:id/subscription

Get detailed subscription info including live Stripe status and recent invoices.

**Response (200):**
```json
{
  "subscription": {
    "id": "uuid",
    "status": "active",
    "planId": "starter",
    "planName": "Starter",
    "planPriceCents": 4900,
    "planCurrency": "usd",
    "trialType": null,
    "trialEndsAt": null,
    "siteLimit": 1,
    "leadLimit": 500,
    "currentPeriodStart": "2025-03-01T00:00:00Z",
    "currentPeriodEnd": "2025-04-01T00:00:00Z",
    "delinquentSince": null,
    "stripeCustomerId": "cus_xxx",
    "stripeSubscriptionId": "sub_xxx",
    "createdAt": "2025-01-15T00:00:00Z"
  },
  "stripe": {
    "status": "active",
    "cancelAtPeriodEnd": false,
    "discount": null
  },
  "invoices": [
    {
      "id": "in_xxx",
      "date": 1711929600,
      "amountPaid": 4900,
      "status": "paid",
      "hostedUrl": "https://invoice.stripe.com/...",
      "pdfUrl": "https://invoice.stripe.com/..."
    }
  ]
}
```

`stripe` can be `null` if the Stripe subscription doesn't exist (e.g., cancelled). `invoices` returns up to 6 most recent.

**Errors:** `404` no subscription found

---

### PUT /api/account/:id/subscription

Change the account's plan.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| newPlanId | string | Yes | Plan ID to switch to. Valid IDs: `lite`, `starter`, `professional`, `enterprise`, `multisite_10`, `multisite_25`, `multisite_50` |
| billingPeriod | string | No | `"monthly"` (default) or `"annual"` |
| leadLimit | number | No | Required for `enterprise` plan — number of leads (e.g., 5000) |
| prorate | boolean | No | Whether to prorate charges (default: `true`) |
| supportCaseId | string | No | Support case ID |

**Plan pricing reference:**
| Plan | Monthly | Annual | Lead Limit | Site Limit |
|------|---------|--------|------------|------------|
| lite | $29 | $290 | 100 | 1 |
| starter | $49 | $490 | 500 | 1 |
| professional | $99 | $990 | 1,000 | 1 |
| enterprise | $100/1k leads | $1000/1k leads | Custom | 1 |
| multisite_10 | $199 | — | Unlimited | 10 |
| multisite_25 | $299 | — | Unlimited | 25 |
| multisite_50 | $399 | — | Unlimited | 50 |

**Response (200):**
```json
{
  "success": true,
  "plan": {
    "id": "professional",
    "name": "Pro",
    "priceCents": 9900,
    "siteLimit": 1,
    "leadLimit": 1000
  }
}
```

**Errors:** `400` invalid plan ID or no Stripe subscription, `404` no subscription found

---

### PUT /api/account/:id/status

Cancel the account's subscription.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| atPeriodEnd | boolean | No | If `true`, cancels at end of billing period. Default: `false` (immediate). |
| reason | string | No | Human-readable cancellation reason (e.g., "Too expensive") |
| feedback | string | No | Additional feedback from the customer |
| supportCaseId | string | No | Support case ID |

**Response (200):**
```json
{
  "success": true,
  "status": "cancelled",
  "cancelledAt": "2025-03-29T12:00:00Z"
}
```

When `atPeriodEnd` is `true`, `status` is `"cancel_scheduled"` and `cancelledAt` is the period end date.

**Errors:** `400` no Stripe subscription ID, `404` no subscription, `409` already cancelled

---

### PUT /api/account/:id/trial

Extend a trial period.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| days | number | No | Number of days to extend (default: 7). Added to current trial end. |
| newTrialEnd | string | No | Explicit ISO date for new trial end (overrides `days`) |
| supportCaseId | string | No | Support case ID |

Provide either `days` or `newTrialEnd`, not both.

**Response (200):**
```json
{
  "success": true,
  "trial": {
    "previousEnd": "2025-04-15T00:00:00Z",
    "newEnd": "2025-04-22T00:00:00Z",
    "status": "cardless"
  }
}
```

**Errors:** `400` account is not on a trial (response includes `currentStatus`), `404` no subscription

---

## Account Management

### PUT /api/account/:id/owner

Transfer account ownership to a new person. Updates the account email, login credentials, and Stripe customer.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | New owner's email |
| firstName | string | No | New owner's first name |
| lastName | string | No | New owner's last name |
| company | string | No | New company name |
| supportCaseId | string | No | Support case ID |

**Response (200):**
```json
{
  "success": true,
  "account": {
    "email": "new-owner@company.com",
    "name": "New Owner",
    "company": "New Corp"
  },
  "previousEmail": "old-owner@company.com"
}
```

**Important:** After transferring ownership, the new owner needs a password reset to be able to log in. Call the password-reset endpoint after this.

**Errors:** `400` email missing, `404` account not found

---

### POST /api/account/:id/password-reset

Send a password reset email to a user on the account.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | Email address to send the reset to |
| supportCaseId | string | No | Support case ID |

**Response (200):**
```json
{
  "success": true,
  "email": "customer@example.com",
  "message": "Password reset email sent"
}
```

**Errors:** `400` email missing, `404` account not found, `502` customer app failed to send the email

---

### POST /api/account/:id/impersonate

Generate a one-time impersonation link to log in as the customer in the customer app.

**Request Body:** None required

**Response (200):**
```json
{
  "success": true,
  "url": "https://app.attributer.io/api/auth/impersonate?token=<session-token>",
  "expiresAt": "2025-03-29T13:00:00Z"
}
```

The URL opens the customer app logged in as the account owner. Session expires in 1 hour.

**Errors:** `404` account not found, `500` session creation failed

---

## Common Patterns

### Typical workflow: Handle a support ticket

1. Look up the account: `GET /api/account/by-email?email=customer@example.com`
2. Get full details: `GET /api/account/:id`
3. Take action based on the request (refund, plan change, etc.)
4. Always pass `supportCaseId` for audit trail

### Error response format

All error responses follow this shape:
```json
{ "error": "Human-readable error message" }
```

Stripe-specific errors also include:
```json
{ "error": "Card was declined", "code": "card_declined", "type": "card_error" }
```

### Idempotency

| Endpoint | Safe to retry? |
|----------|---------------|
| Refund | Partially — returns 409 if already fully refunded |
| Cancel | Yes — returns 409 if already cancelled |
| Discount | Yes — replaces existing discount |
| Credit | **No** — each call adds more credit |
| Trial extend | Safe but additive — each call moves the date further |
| Owner transfer | Yes — updating to same values is a no-op |
| Password reset | Yes — sends another email |
