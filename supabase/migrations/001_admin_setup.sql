-- Run this migration in the Supabase SQL Editor (Dashboard > SQL Editor)
-- It creates the licensing_reviews table and adds performance indexes.

-- 1. Enable pg_trgm for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Create licensing_reviews table
CREATE TABLE IF NOT EXISTS licensing_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain varchar NOT NULL,
  action varchar NOT NULL, -- 'blocked' or 'dismissed'
  reason varchar,
  notes text,
  actioned_at timestamptz NOT NULL DEFAULT now(),
  actioned_by varchar
);

-- 3. Performance indexes for event_log
CREATE INDEX IF NOT EXISTS idx_event_log_account_created ON event_log (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_type_subtype ON event_log (event_type, event_subtype);

-- 4. Trigram indexes for fuzzy search
CREATE INDEX IF NOT EXISTS idx_accounts_email_trgm ON accounts USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_accounts_company_trgm ON accounts USING gin (company gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_user_email_trgm ON "user" USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_user_name_trgm ON "user" USING gin (name gin_trgm_ops);

-- 5. Licensing reviews index
CREATE INDEX IF NOT EXISTS idx_licensing_reviews_domain ON licensing_reviews (domain);
