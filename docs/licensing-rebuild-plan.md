# Licensing System Rebuild — Domain-Level Tracking Pipeline

## Context

The current licensing system tries to process an entire CSV through a multi-step pipeline (including a slow install checker at 6-10s per domain) in a single HTTP request. This times out with real data. We need a fundamentally different architecture: store each domain as a row, process checks asynchronously in batches, and present only confirmed unlicensed domains for review.

---

## The New Architecture

### One table: `licensing_domains`

Replaces both `licensing_reviews` and `licensing_scans`. One row per unique domain we've ever seen in a CSV.

```sql
CREATE TABLE licensing_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain varchar NOT NULL UNIQUE,
  call_count integer NOT NULL DEFAULT 0,
  last_seen_at timestamp with time zone,
  is_licensed boolean NOT NULL DEFAULT false,
  is_blocked boolean NOT NULL DEFAULT false,
  script_installed boolean,           -- null = not yet checked
  script_checked_at timestamp with time zone,
  status varchar NOT NULL DEFAULT 'new',
  account_id uuid,
  account_name varchar,
  account_email varchar,
  review_note text,
  reviewed_at timestamp with time zone,
  reviewed_by varchar,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_licensing_domains_status ON licensing_domains(status);
CREATE INDEX idx_licensing_domains_domain ON licensing_domains(domain);
```

**Status values:** `new`, `licensed`, `blocked`, `pending_check`, `confirmed_unlicensed`, `not_installed`, `check_failed`, `dismissed`

### Status lifecycle

```
CSV import
    ↓
  "new"
    ↓
  Fast checks (licensed? blocked?)
    ↓                    ↓                ↓
"licensed"         "blocked"       "pending_check"
  (done)            (done)              ↓
                                  Checker service (async, batched)
                              ↓           ↓           ↓
                    "confirmed_unlicensed" "not_installed" "check_failed"
                              ↓                              ↓
                        You review                    Retry later
                        ↓         ↓
                   "blocked"  "dismissed"
```

### Re-check logic on subsequent weekly scans

| Current status | What happens |
|---|---|
| `new` | Update call_count + last_seen_at, continue processing |
| `licensed` | Re-check subscription. If cancelled → reset to `new` |
| `blocked` | Re-check licensing server. If unblocked → reset to `new` |
| `pending_check` | Update call_count + last_seen_at only |
| `confirmed_unlicensed` | Update call_count + last_seen_at only |
| `not_installed` | Update call_count + last_seen_at only |
| `check_failed` | Reset to `pending_check` (retry) |
| `dismissed` | Update call_count + last_seen_at only (decision stands) |

---

## Three Cron Jobs

### Cron 1: Weekly CSV Import + Fast Checks (Monday 6am)

**Endpoint:** `GET /api/cron/licensing`

1. Fetch CSV from `licenses.attributer.io/report.csv`
2. Parse and normalize domains
3. Upsert every domain into `licensing_domains` (update call_count + last_seen_at)
4. For `status = 'new'`:
   - Check licensed (sites + subscriptions DB query) → set `licensed` or continue
   - Check blocked (licensing server) → set `blocked` or continue
   - Get account context if domain exists in sites table
   - Set remaining to `pending_check`
5. For `status = 'licensed'`: re-check subscription, reset to `new` if cancelled
6. For `status = 'blocked'`: re-check licensing server, reset to `new` if unblocked
7. For `status = 'check_failed'`: reset to `pending_check`

Runs in seconds — no install checker.

### Cron 2: Install Checker (every 30 minutes)

**Endpoint:** `GET /api/cron/check-installs`

1. Select up to 20 domains where `status = 'pending_check'`, ordered by call_count DESC
2. For each, call checker service sequentially (2.1s delay)
3. Update each domain:
   - Script found → `confirmed_unlicensed`
   - Not found → `not_installed`
   - Indeterminate → `check_failed`

Each batch takes ~42 seconds. At 48 batches/day = 960 domains/day.

### Cron 3: Railway functions

- `licensing-cron.js` — weekly Monday 6am (`0 6 * * 1`) → calls `/api/cron/licensing`
- `check-installs-cron.js` — every 30 min (`*/30 * * * *`) → calls `/api/cron/check-installs`

---

## Updated UI

### Licensing page shows:

**Status summary bar:**
- X confirmed unlicensed (need review)
- X pending install check
- X blocked (this month)
- X dismissed (this month)

**Main table:** Domains with `status = 'confirmed_unlicensed'`, sorted by call_count DESC.

Each row: Domain, call count, last seen, linked account, Block / Dismiss buttons.

**Manual CSV upload:** Collapsed section below the main table. When uploaded, domains get upserted into `licensing_domains` with `status = 'new'` and fast checks run immediately. Install checks happen via the regular 30-min cron.

**Pipeline indicator:** "X domains pending install check — checks run every 30 minutes"

---

## API Endpoints

### Unchanged
- `POST /api/licensing/action` — Block/dismiss (update `licensing_domains` status instead of inserting into `licensing_reviews`)

### Rewritten
- `GET /api/cron/licensing` — Weekly CSV import + fast checks
- `GET /api/licensing/scans` → rename to `GET /api/licensing/domains` — returns confirmed_unlicensed domains + status counts

### New
- `GET /api/cron/check-installs` — Batch install checker

### Updated
- `POST /api/licensing/process` — Manual CSV upload → upsert to `licensing_domains` + run fast checks

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/db/schema/licensing-domains.ts` | New Drizzle schema |
| `src/app/api/cron/check-installs/route.ts` | Install checker cron endpoint |
| `src/app/api/licensing/domains/route.ts` | Fetch domains by status + counts |
| `functions/check-installs-cron.js` | Railway cron function (every 30 min) |

## Files to Modify

| File | Change |
|------|--------|
| `src/db/schema/index.ts` | Add new schema export |
| `src/app/api/cron/licensing/route.ts` | Rewrite: CSV import + fast checks + upsert |
| `src/app/api/licensing/action/route.ts` | Update licensing_domains instead of licensing_reviews |
| `src/app/api/licensing/process/route.ts` | Upsert to licensing_domains + fast checks |
| `src/app/(admin)/licensing/page.tsx` | New page structure |
| `src/app/(admin)/licensing/_components/licensing-upload.tsx` | Rewrite: domain list view + collapsed upload |

## Files to Remove (later, after confirming everything works)

| File | Why |
|------|-----|
| `src/db/schema/licensing-scans.ts` | Replaced by licensing_domains |
| `src/app/api/licensing/scans/route.ts` | Replaced by licensing/domains |

## Pipeline files — keep but simplify

| File | Change |
|------|--------|
| `src/lib/licensing/pipeline.ts` | Remove `runPipeline()`. Keep individual helper functions (filterLicensedDomains, filterBlockedDomains, etc.) — they're used by the cron endpoints |
| `src/lib/external/blocklist.ts` | Keep as-is |
| `src/lib/external/install-checker.ts` | Keep as-is |
| `src/lib/licensing/normalize.ts` | Keep as-is |
| `src/lib/licensing/process-csv.ts` | Keep as-is |

---

## Database Migration

Run on staging Supabase (`rvcwgyrexjkteykvlsui`):

1. Create `licensing_domains` table with indexes
2. Migrate existing `licensing_reviews` data: for each review, upsert into `licensing_domains` with the review's action as the status and reviewed_at/reviewed_by
3. `licensing_scans` can be dropped (just created, likely empty or has one test row)
4. Keep `licensing_reviews` table for now — remove from schema exports but don't drop the table yet

---

## Verification

1. Build passes
2. Tests updated and passing
3. Trigger weekly cron manually → domains upserted with correct statuses
4. Trigger check-installs cron → pending domains get checked in batches
5. Open licensing page → only confirmed_unlicensed domains shown
6. Block a domain → status updates, licensing server called
7. Dismiss a domain → disappears from list
8. Trigger weekly cron again → dismissed stays dismissed, blocked re-checked
