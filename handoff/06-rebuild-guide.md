# 06 — Rebuild Guide

Recommended starting point for the rewrite. What to build first, what to defer, what to drop.

---

## Suggested stack

### Keep from the prototype

| Component | Recommendation | Reason |
|---|---|---|
| **Supabase** | Keep | Sound choice. RLS, auth, and storage all work well. The problems in the prototype were in query design and type sync, not in Supabase itself. |
| **Next.js (App Router)** | Keep | Works fine. No reason to change. |
| **TypeScript** | Keep | Enforce it properly from day one — no `ignoreBuildErrors`. |
| **shadcn/ui + Tailwind** | Keep | No issues with these. |
| **sentence-transformers + Ridge regression** | Keep | The ML approach validated well. Keep the model, improve the training infrastructure. |
| **Anthropic Claude API** | Keep | For document analysis (redesigned). |

### Reconsider from the prototype

| Component | Recommendation | Reason |
|---|---|---|
| **GitHub Actions as pipeline trigger** | Reconsider | Fine for the scheduled daily capture. Brittle for user-triggered operations (retrain, analysis, backfill). Consider a lightweight job queue or a dedicated worker. |
| **Pickle files in Supabase Storage** | Improve | Works, but fragile across Python version changes. Consider joblib with explicit Python/sklearn version metadata stored alongside the artifact. |
| **Python for the pipeline** | Keep | But clean up the dual SQLite/Supabase implementations — start with Supabase only. |

### Drop from the prototype

| Component | Recommendation |
|---|---|
| SQLite storage/state implementations | Delete. Dead code from an earlier iteration. |
| `enrich.yml` workflow | Delete. Enrichment now happens inline during capture. |
| `run_enrich.py` | Delete. Same reason. |
| The two-analysis structure (technical/administrative) in `tender_analysis` | Redesign. See open questions. |
| `ignoreBuildErrors` in Next.js config | Fix the underlying type issues, remove the flag. |

---

## What to build first

### Phase 1: Foundation (before any features)

1. **Schema**: Design and write the full schema in SQL from the start. Apply the lessons from the prototype (everything nullable that comes from PLACSP, proper indexes on every foreign key and filtered column, RLS policies for every table from day one).

2. **Type sync**: Set up automatic Supabase type generation as part of the build process. Never hand-write database types.

3. **Daily capture pipeline**: The daily PLACSP fetch is the system's heartbeat. Get this right before anything else. Make it idempotent (safe to run multiple times), timezone-aware, and explicitly handle all PLACSP data quality issues (NULL budget, missing CPV, duplicate external IDs).

4. **Hard filter evaluation**: Straightforward logic, but test it with edge cases: NULL budget, empty CPV array, tenders that fail multiple filters simultaneously.

5. **Project inbox (read-only)**: Show passing tenders. No scoring yet, just the list. Validates the full pipeline from capture → filter → display.

### Phase 2: Core value

6. **Historical data import**: Before the ML model can be useful, you need historical tenders for training. Design and build the import workflow first — bulk import from PLACSP historical data. This is a prerequisite for training.

7. **Training interface**: Users label historical tenders. The carousel-style queue (show 5 at a time, auto-fetch more as you go) worked well in the prototype. Keep that pattern.

8. **Model training**: Trigger retrain when new labels are added. Cache the sentence-transformer model aggressively (it's 500 MB). Store model artifacts with metadata (version, MAE, label count, Python/sklearn version).

9. **ML scoring in inbox**: Replace neutral fallback with trained scores. Sort inbox by model score.

10. **Filter change → training session invalidation**: Implement before users can change filters in production. The logic is: changing filters increments the training session, and labels for tenders that now fail the new filters are invalidated. Surface the impact to the user before they confirm.

### Phase 3: Document handling

11. **General document retrieval**: Fetch all documents attached to a tender from PLACSP. Store document metadata (name, URL, type) associated with the tender. Do not hard-code assumptions about which document types exist.

12. **AI analysis (redesigned)**: Decide on the new analysis structure before building. See `07-open-questions.md`.

### Defer

- **Admin user management UI**: Provisioning users via the Supabase dashboard is fine early on.
- **Pipeline monitoring dashboard**: GitHub Actions logs are sufficient initially.
- **Multi-source capture** (beyond PLACSP): Not needed yet.

---

## Schema design principles for the rewrite

Following the lessons from the prototype:

1. **Every column from external data is nullable** unless you have ironclad evidence it's always present. PLACSP data has gaps everywhere.

2. **Index every foreign key**. Index every column that appears in a WHERE clause. Verify with EXPLAIN ANALYZE before shipping any query that touches `tenders_raw` (it will be large).

3. **Write RLS policies for every table before writing any application code**. Test them explicitly — they're SQL, not application logic, and won't be caught by app-level tests.

4. **Keep generated Supabase types in the repo and regenerate them as part of CI**. Any drift between the schema and TypeScript types should fail the build.

5. **Avoid large OR conditions in queries**. Use `ANY(array)` with appropriate indexes, or split into multiple queries.

---

## Pipeline architecture recommendation

The daily scheduled pipeline (capture → filter → score) can stay in GitHub Actions. It runs once a day and latency doesn't matter.

For user-triggered operations (retrain, analysis), consider:

**Option A: Keep GitHub Actions but improve error handling.** Add explicit status reporting (write a status row to the database before and after each step, display it in the UI). Add retry logic. This is the lowest-lift improvement.

**Option B: Add a lightweight job queue.** A simple Postgres-backed queue (using `pg_listen/pg_notify` or a table with a `claimed_at` column) processed by a small always-on worker. More reliable, better retry semantics, but requires a process to keep running.

**Option C: Use a managed task queue.** Something like Inngest, Trigger.dev, or a simple webhook-triggered Lambda. Middle ground between the simplicity of GitHub Actions and the reliability of a real queue.

The choice depends on how much operational complexity is acceptable. For the initial rewrite, Option A is the pragmatic starting point. Move to Option B or C if job reliability becomes a problem in practice.

---

## Historical data import design

The prototype has two entry points for historical data:
- `run_capture_historical.py`: ingest historical PLACSP data (tenders)
- `run_ingest_historical.py`: ingest historical bids from a CSV

These should be redesigned as a single, clearly documented import workflow. Requirements:
1. Ingest historical PLACSP tenders (going back as far as available) for training purposes.
2. Deduplicate against already-captured tenders (same `external_id + source` constraint).
3. Make it easy to re-run without side effects.
4. Surface progress (how many tenders imported, how many already existed, how many failed).

The import workflow is a prerequisite for training. Plan it as a first-class feature, not a script run once and forgotten.
