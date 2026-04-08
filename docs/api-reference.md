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

## Search

### GET /api/search

Search for accounts by name, email, or company.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| q | string | Yes | Search query (minimum 2 characters) |

**Response (200):**
```json
{
  "results": [
    {
      "id": "uuid",
      "name": "Jane Smith",
      "email": "jane@acme.com",
      "company": "Acme Corp",
      "planName": "Starter",
      "status": "active",
      "matchType": "exact"
    }
  ]
}
```

Returns up to 8 matching accounts. Matches against email, name, and company (case-insensitive). Returns empty `results` array if query is missing or under 2 characters.

---

## Data Enrichment

### POST /api/account/:id/enrich

Request enrichment of account data. This kicks off an async job — results arrive via the enrichment webhook.

**Request Body:** None required

**Response (200):**
```json
{
  "success": true,
  "jobId": "job_xxx",
  "message": "Enrichment requested — results will arrive via webhook"
}
```

**Errors:** `404` account not found, `500` enrichment service not configured, `502` enrichment service unreachable or returned an error

---

## Licensing / Domain Blocking

### GET /api/account/:id/licensing

Check domain blocking status for all sites under an account. Queries the licensing server in real time.

**Response (200):**
```json
{
  "sites": [
    {
      "siteId": "uuid",
      "name": "Main Site",
      "domain": "acme.com",
      "siteStatus": "active",
      "isBlocked": false,
      "blockedAt": null
    }
  ]
}
```

`isBlocked` and `blockedAt` come from the licensing server. Returns empty `sites` array if the account has no sites with domains.

**Errors:** `404` account not found, `500` failed to fetch sites

---

### POST /api/licensing/action

Block, unblock, or dismiss a domain on the licensing server. Records an audit trail in the database.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| domain | string | Yes | The domain to act on (e.g., `"example.com"`) |
| action | string | Yes | `"blocked"`, `"unblocked"`, or `"dismissed"` |
| reason | string | No | Reason for the action |
| notes | string | No | Additional notes |

**Response (200):**
```json
{
  "success": true
}
```

**Behaviour by action:**
- `"blocked"` — calls the licensing server to block the domain, sets status to `blocked` in the database
- `"unblocked"` — calls the licensing server to unblock the domain, resets status to `pending_check`
- `"dismissed"` — does NOT call the licensing server, just sets status to `dismissed` (domain won't be re-checked)

**Errors:** `400` missing domain or invalid action, `500` failed to process

---

### GET /api/licensing/domains

Get domains filtered by status, with counts across all status categories.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| status | string | No | Filter by status (default: `"confirmed_unlicensed"`). See status values below. |
| search | string | No | Filter domains by substring match (case-insensitive) |
| minCalls | number | No | Minimum call count threshold (default: `0`) |

**Status values:** `confirmed_unlicensed`, `pending_check`, `blocked`, `dismissed`, `licensed`, `not_installed`, `check_failed`

**Response (200):**
```json
{
  "domains": [
    {
      "id": "uuid",
      "domain": "example.com",
      "callCount": 1250,
      "lastSeenAt": "2025-03-28T00:00:00Z",
      "isLicensed": false,
      "isBlocked": false,
      "scriptInstalled": true,
      "scriptCheckedAt": "2025-03-27T12:00:00Z",
      "checkError": null,
      "status": "confirmed_unlicensed",
      "accountId": "uuid",
      "accountName": "Acme Corp",
      "accountEmail": "jane@acme.com",
      "reviewNote": null,
      "reviewedAt": null,
      "reviewedBy": null,
      "createdAt": "2025-03-01T00:00:00Z"
    }
  ],
  "counts": {
    "confirmed_unlicensed": 42,
    "pending_check": 15,
    "blocked": 8,
    "dismissed": 3,
    "licensed": 120,
    "not_installed": 55,
    "check_failed": 2
  }
}
```

Returns up to 200 domains per request, sorted by call count (descending). `counts` always includes all status categories regardless of the filter.

---

### GET /api/licensing/lookup

Look up blocking history for a specific domain from the licensing server.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| domain | string | Yes | Domain to look up (e.g., `"example.com"`) |

**Response (200) — domain found:**
```json
{
  "domain": "example.com",
  "isBlocked": true,
  "inSystem": true,
  "lastBlocked": "2025-03-20T10:00:00Z",
  "lastUnblocked": null,
  "history": [
    { "action": "blocked", "date": "2025-03-20T10:00:00Z" }
  ]
}
```

**Response (200) — domain never been in block list:**
```json
{
  "domain": "example.com",
  "isBlocked": false,
  "inSystem": false,
  "history": []
}
```

**Errors:** `400` domain parameter missing, `502` licensing server unreachable or returned an error

---

### POST /api/licensing/process

Upload and process a CSV file of domains for licensing analysis.

**Request Body:** `multipart/form-data`
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | Yes | CSV file containing domains and call counts |

**Response (200):**
```json
{
  "success": true,
  "totalRows": 500,
  "uniqueDomains": 423,
  "message": "Domains imported. Fast checks and install verification will run via cron."
}
```

Domains are normalized and deduplicated before import. Status checks (licensed, blocked, install verification) run via the licensing cron job.

**Errors:** `400` no file provided or no valid rows in CSV, `500` processing failed

---

### GET /api/licensing/scans

Get the latest licensing scan results.

**Response (200):**
```json
{
  "scan": {
    "id": "uuid",
    "scanType": "weekly",
    "totalRows": 1200,
    "uniqueDomains": 980,
    "unlicensedCount": 42,
    "results": { ... },
    "createdAt": "2025-03-28T02:00:00Z"
  }
}
```

Returns `{ "scan": null }` if no scans have been recorded yet.

---

## Cron Jobs

These endpoints are triggered by a cron scheduler and are **not intended for direct use** by external apps. They use a separate `CRON_SECRET` for authentication.

**Authentication:** `Authorization: Bearer <CRON_SECRET>`

### GET /api/cron/enrich

Batch-enrich accounts that haven't been enriched yet. Processes up to 50 accounts per run.

**Response (200):**
```json
{
  "success": true,
  "total": 50,
  "sent": 48,
  "failed": 2
}
```

---

### GET /api/cron/licensing

Weekly licensing pipeline. Fetches the domain report CSV from the licensing server, checks license and block status, and submits pending domains for install verification.

**Pipeline steps:**
1. Fetch and parse CSV from licensing server (domains with 50+ calls)
2. Upsert domains into database
3. Check new domains: mark as `licensed`, `blocked`, or `pending_check`
4. Re-check `licensed` domains (reset to `pending_check` if subscription cancelled)
5. Re-check `blocked` domains (reset to `pending_check` if unblocked externally)
6. Reset `check_failed` domains to `pending_check` for retry
7. Submit all `pending_check` domains to install checker service

**Response (200):**
```json
{
  "success": true,
  "totalRows": 1200,
  "uniqueDomains": 980,
  "pendingInstallCheck": 45,
  "batchSubmitted": true
}
```

---

## Webhooks

These endpoints receive data from external services and are **not intended for direct use**. Each uses its own secret for authentication.

### POST /api/webhooks/enrichment

Receives enrichment results from the enrichment service.

**Authentication:** `Authorization: Bearer <ENRICHMENT_API_KEY>`

**Payload fields:** `external_id` (required), `status`, `job_id`, `industry`, `sub_industry`, `company_size`, `signup_path`, `employee_count`, `company_description`, `company_linkedin_url`, `job_title_raw`, `job_role`, `seniority_level`, `person_description`, `person_location`, `person_linkedin_url`, `years_experience`, `email_domain`, `domains_match`, `confidence_industry`, `confidence_size`, `confidence_path`, `confidence_person`

**Response (200):**
```json
{
  "success": true
}
```

**Errors:** `400` missing external_id, `401` unauthorized, `404` account not found, `500` failed to update

---

### POST /api/webhooks/checker

Receives domain install check results from the checker service.

**Authentication:** `Authorization: Bearer <CHECKER_WEBHOOK_SECRET>`

**Payload fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| domain | string | Yes | The domain that was checked (may include protocol, will be normalized) |
| removed | boolean/null | Yes | `false` = script installed (confirmed unlicensed), `true` = not installed, `null` = check failed |
| error | string | No | Error message if check failed |
| checkedAt | string | No | ISO timestamp of when the check was performed |

**Response (200):**
```json
{
  "success": true
}
```

**Status mapping:** `removed: false` → `confirmed_unlicensed`, `removed: true` → `not_installed`, `removed: null` → `check_failed`

**Errors:** `400` missing domain, `401` unauthorized, `500` internal error

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
| Enrich | Safe — enrichment service handles dedup by job |
| Licensing action | **Use caution** — blocking/unblocking is toggled on the licensing server each time |
| Licensing process | Safe but additive — re-importing a CSV upserts domains (updates call counts) |
