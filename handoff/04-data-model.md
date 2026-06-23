# 04 — Data Model

## Entity overview

```
auth.users (Supabase managed)
    │
    ▼
profiles ──────────────────────────────────┐
    │                                       │
    ├── projects (created_by)               │
    │       │                               │
    │       ├── project_members ────────────┘
    │       │       (user ↔ project)
    │       │
    │       ├── project_filters (1:1 per project)
    │       │
    │       ├── tender_filter_results (per project, per tender)
    │       │
    │       ├── tender_model_scores (per project, per tender, per version)
    │       │
    │       └── tender_scores (per project, per tender, per user, per session)
    │
    └── tender_analysis (per tender, per project, per type)

tenders_raw (global, not per-project)
    │
    └── (referenced by tender_scores, tender_filter_results,
         tender_model_scores, tender_analysis)
```

---

## Tables

### `profiles`
Extends Supabase auth. One row per registered user.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | References `auth.users.id` |
| email | text | |
| role | text | `'admin'` or `'user'` |
| full_name | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `projects`
A project is one client company's monitoring configuration.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| description | text | |
| created_by | uuid | References `profiles.id` |
| is_active | boolean | Inactive projects are skipped by pipeline |
| training_session | integer | Incremented on every filter change. Used to invalidate stale training labels. |
| prompt_technical | text | System prompt for Claude's technical analysis |
| prompt_administrative | text | System prompt for Claude's administrative analysis |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `project_members`
Many-to-many join: which users belong to which projects.

| Column | Type | Notes |
|---|---|---|
| project_id | uuid | References `projects.id` |
| user_id | uuid | References `profiles.id` |
| assigned_at | timestamptz | |

PK: `(project_id, user_id)`

### `project_filters`
One row per project. Stores the hard filter configuration.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| project_id | uuid | References `projects.id`. UNIQUE (one filter config per project). |
| budget_min | numeric | Nullable. NULL = no lower bound. |
| budget_max | numeric | Nullable. NULL = no upper bound. |
| regions | text[] | NUTS codes (e.g. `['ES11', 'ES51']`). Empty = no region filter. |
| cpv_codes | text[] | CPV prefix codes (e.g. `['79416', '79340']`). Prefix match: tender CPV starting with any of these passes. |
| contract_types | text[] | Filter by contract type enum values. |
| procedure_types | text[] | Filter by procedure type enum values. |
| buyer_types | text[] | Filter by buyer type enum values. |
| keywords_include | text[] | Tender must match at least one keyword. |
| keywords_exclude | text[] | Tender must not match any keyword. |
| max_lot_count | integer | Nullable. |
| min_contract_months | integer | Nullable. |
| max_contract_months | integer | Nullable. |
| updated_at | timestamptz | |

### `tenders_raw`
Global table. One row per tender from any source. Not per-project.

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| external_id | text | UNIQUE per source. PLACSP's own identifier. |
| source | text | Default `'placsp'`. |
| title | text | |
| summary | text | |
| link | text | URL to PLACSP tender detail page |
| published_at | timestamptz | When published on PLACSP |
| deadline_at | timestamptz | Submission deadline. Nullable. |
| buyer_name | text | |
| region | text | NUTS code (e.g. `'ES51'`) |
| region_label | text | Human-readable (e.g. `'Cataluña'`). Resolved at write time. |
| budget_amount | numeric | Nullable. Missing budget ≠ zero budget. |
| status | text | PLACSP status code: `PUB` (open), `ADJ` (awarded), etc. Nullable. |
| contract_type | text | |
| procedure_type | text | |
| lot_count | integer | Nullable. |
| duration_months | integer | Nullable. |
| buyer_type | text | |
| cpv_codes | text[] | Raw CPV codes from PLACSP. Can be empty array. |
| cpv_labels | text[] | Human-readable CPV labels. Resolved at write time. |
| created_at | timestamptz | |
| updated_at | timestamptz | |

UNIQUE: `(external_id, source)`

### `tender_scores`
Human-assigned training labels.

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| tender_id | bigint | References `tenders_raw.id` |
| project_id | uuid | References `projects.id` |
| scored_by | uuid | References `profiles.id` |
| score | integer | 0–5 |
| scored_at | timestamptz | |
| training_session | integer | Copied from `projects.training_session` at time of scoring. Labels from old sessions are not used for training. |

UNIQUE: `(tender_id, project_id, scored_by, training_session)`

### `tender_model_scores`
ML model output. One row per (tender, project, model version).

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| tender_id | bigint | References `tenders_raw.id` |
| project_id | uuid | References `projects.id` |
| model_score | numeric(4,3) | 0.000–5.000 |
| model_version | text | Date string like `'20260407'` or `'neutral'` for fallback |

UNIQUE: `(tender_id, project_id, model_version)`

When displaying scores, keep only the highest `model_version`. "neutral" always loses to a real version. Version comparison is a string comparison that must handle `"neutral"` as a special sentinel, not a date.

### `tender_filter_results`
Hard filter evaluation output. One row per (tender, project).

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| tender_id | bigint | References `tenders_raw.id` |
| project_id | uuid | References `projects.id` |
| passed | boolean | Did the tender pass all hard filters? |
| discard_reasons | text[] | If failed: which filters it failed (e.g. `['budget_below_min', 'region_mismatch']`) |
| evaluated_at | timestamptz | |

UNIQUE: `(tender_id, project_id)`

### `tender_analysis`
LLM analysis results for a specific tender + project + analysis type.

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| tender_id | bigint | References `tenders_raw.id` |
| project_id | uuid | References `projects.id` |
| analysis_type | text | `'technical'` or `'administrative'` |
| triggered_by | uuid | References `profiles.id` |
| status | text | `'pending'`, `'running'`, `'done'`, `'error'` |
| services_required | text | LLM output field |
| administrative_conditions | text | LLM output field |
| technical_conditions | text | LLM output field |
| attached_files | jsonb | Array of `{name, url, type}` for retrieved documents |
| raw_llm_output | jsonb | Full Claude response for debugging |
| triggered_at | timestamptz | |
| completed_at | timestamptz | |

UNIQUE: `(tender_id, analysis_type, project_id)`

### `pipeline_state`
Key-value store for pipeline run metadata.

| Column | Type | Notes |
|---|---|---|
| key | text PK | e.g. `'last_run_at'` |
| value | text | |
| updated_at | timestamptz | |

---

## Key invariants

1. **Budget NULL = unknown, not zero.** Filter logic must treat NULL budget as passing the budget check.
2. **CPV codes are arrays.** A tender can have zero, one, or many CPV codes. Filter matching is: tender passes if ANY of its CPV codes starts with ANY of the project's CPV filter prefixes.
3. **Training labels are session-scoped.** A label's `training_session` must match the project's current `training_session` to be used in model training. Old labels from previous sessions are retained in the database but ignored.
4. **Only `status='PUB'` or NULL tenders appear in the inbox.** Awarded (`ADJ`) and other closed tenders are filtered out of the inbox view.
5. **Model version comparison.** When multiple model_score rows exist for (tender, project), keep the one with the highest version. `"neutral"` is always the lowest version. Real versions are `"YYYYMMDD"` strings that sort correctly as strings.

---

## RLS summary

- **Admin role**: reads and writes all rows in all tables.
- **User role (tenders_raw)**: any authenticated user can read any tender.
- **User role (projects, members, filters, scores, analysis)**: can only access rows for projects where they have a row in `project_members`.
- **Helper functions**: `is_admin(uid)` and `is_project_member(uid, project_id)` are Postgres functions used in policy definitions.
