# Enrichment Pipeline Changes — April 2026

## Why

The enrichment service API has been updated to return significantly more data — person-level LinkedIn info, company descriptions, employee counts, etc. The admin app's database schema, submission pipeline, webhook handler, and UI have been updated to support all the new fields.

## What Changed

### Database: `account_enrichment` table

**Renamed columns:**
| Old column name | New column name |
|----------------|-----------------|
| `job_title` | `job_title_raw` |
| `job_description` | `person_description` |

**New columns added:**
| Column | Type | Description |
|--------|------|-------------|
| `employee_count` | integer (nullable) | Exact employee count from LinkedIn |
| `company_description` | text (nullable) | 1-2 sentence summary of what the company does |
| `company_linkedin_url` | varchar (nullable) | LinkedIn company page URL |
| `job_role` | varchar (nullable) | Categorized role (Marketing, Sales, Technical, etc.) |
| `seniority_level` | varchar (nullable) | Seniority bucket (Owner/Founder, C-Suite, VP, Director, Manager, IC) |
| `person_location` | varchar (nullable) | City/country from LinkedIn profile |
| `person_linkedin_url` | varchar (nullable) | LinkedIn profile URL |
| `years_experience` | integer (nullable) | Estimated total career years |
| `email_domain` | varchar (nullable) | Domain extracted from signup email |
| `domains_match` | boolean (nullable) | Whether email domain matches website domain |
| `confidence_person` | integer (nullable) | 0-100 confidence score for person match |

**No columns were removed.** All existing columns remain (id, account_id, industry, sub_industry, company_size, signup_path, confidence_industry, confidence_size, confidence_path, enriched_at, created_at, updated_at).

### Migration status

The SQL migration has already been run on both **staging** (`rvcwgyrexjkteykvlsui`) and **production** (`yfnuwokniutemccjubqt`). The columns exist in the database now.

### Submission changes

The enrichment service now receives `person_name` as an additional field when submitting jobs. This comes from `accounts.name`. The `accounts` table is unchanged — we're just reading an existing field we weren't sending before.

### Webhook payload changes

The webhook callback from the enrichment service now returns all the new fields listed above. The admin app's webhook handler at `/api/webhooks/enrichment` has been updated to accept and store them. The webhook payload shape is backwards-compatible — all new fields are nullable and default to null if not present.

## Impact on customer-facing app

- If the customer app reads from `account_enrichment`, any code referencing `job_title` or `job_description` columns will break — those columns have been renamed to `job_title_raw` and `person_description`.
- All new columns are nullable with no defaults, so they won't affect existing inserts/upserts that don't include them.
- The `accounts` table is completely unchanged.
- No other tables were modified.
