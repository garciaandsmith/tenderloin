# 03 — Discoveries

Things learned the hard way. Gotchas, dead ends, surprising behaviors. Read this before you touch the pipeline or data model.

---

## PostgreSQL statement timeouts from PostgREST joins

**What happened**: The inbox query used Supabase's embedded join syntax (a single `select()` call with nested table references). On a non-trivial dataset this caused Postgres error `57014: canceling statement due to statement timeout`. It looked like a Supabase bug at first.

**Root cause**: PostgREST's embedded joins can generate queries that do full-table scans if the join columns aren't indexed, or if the query planner can't push predicates down through the join. The tenders tables were large enough to trigger this.

**Fix**: Split the query into four sequential indexed lookups. Each lookup hits a btree index on a known column. The total time is lower than the single join, even with multiple round trips.

**Lesson**: Don't assume PostgREST will generate efficient SQL for complex joins. Verify the query plan with `EXPLAIN ANALYZE` for any query that touches large tables. Design indexes first, queries second.

---

## Naive datetimes causing silent failures in capture

**What happened**: The PLACSP capture was failing inconsistently. Tenders would sometimes not be written despite a seemingly successful run.

**Root cause**: Python datetime objects without timezone info (`naive` datetimes) were being compared with timezone-aware datetimes from Supabase. Python raises no error — it silently produces wrong comparisons or crashes at serialization time depending on context.

**Fix**: All datetimes in the pipeline are now created as timezone-aware UTC (`datetime.now(timezone.utc)`, not `datetime.now()`).

**Lesson**: Never use `datetime.now()` in the pipeline. Always use `datetime.now(timezone.utc)`. Enforce this with a linter rule or a wrapper utility.

---

## CPV NOT NULL constraint breaking capture

**What happened**: Some tenders from PLACSP have no CPV codes. The initial schema had a `NOT NULL` constraint on the CPV column. This caused the capture upsert to fail silently for those tenders — they were dropped.

**Fix**: Remove the NOT NULL constraint. Treat missing CPV codes as an empty array. Handle NULL cpv_codes explicitly in the filter logic (a tender with no CPV codes passes any CPV filter where the filter is "include if any code matches" — it shouldn't pass).

**Lesson**: PLACSP data is incomplete. Every field that comes from external data should be treated as potentially NULL. Design the schema defensively.

---

## Duplicate key errors on PLACSP upsert

**What happened**: The upsert on `tenders_raw` (keyed on `external_id + source`) was throwing constraint violations. The same tender was being processed twice in a single capture run.

**Root cause**: The PLACSP Atom feed and the monthly ZIP can overlap — the same tender appears in both. The capture code was not deduplicating before the upsert.

**Fix**: Deduplicate by `external_id` before writing, and ensure the upsert conflict target (`ON CONFLICT (external_id, source)`) is correct.

**Lesson**: When ingesting from multiple PLACSP data sources (feed + ZIP + historical), always deduplicate before writing.

---

## Budget NULL means "unknown", not "zero"

**What happened**: Some tenders have no budget amount in PLACSP data. The filter logic was treating NULL budget as failing the budget range filter.

**The right behavior**: A tender with an unknown budget should pass the budget filter (you can't exclude it just because the budget wasn't published). The filter should only reject tenders whose budget is known *and* outside the range.

**Fix**: Filter logic treats NULL budget as passing the budget check.

**Lesson**: Distinguish between "we know this value is zero" and "we don't have this value." In procurement data, missing budget is very common and should never be a reason for disqualification.

---

## OR filter conditions causing full-table scans

**What happened**: A filter query that used large OR conditions (e.g., matching against many CPV codes or many region codes) degraded badly as the number of tenders grew. The Postgres query planner abandoned index use when the OR list was long enough.

**Fix**: Split the OR filter into two passes (a "rough pass" using a partial index, then a "precise pass"). Also created partial indexes on commonly filtered columns.

**Lesson**: Any filter that uses `ANY(array)` or large OR conditions against a growing table needs to be tested at scale from the start. Benchmark with 100k rows, not 1k rows.

---

## The enrichment step became a no-op but the workflow still exists

**What happened**: Originally, enrichment (resolving CPV codes and NUTS codes to human-readable labels) ran as a separate step after capture. This was refactored so enrichment happens inline during capture. The `enrich.yml` workflow and `run_enrich.py` script still exist but do nothing meaningful.

**Risk**: Someone maintaining the pipeline might think enrichment is happening in two places, or might modify `run_enrich.py` thinking it still runs. The dead code is misleading.

**Lesson**: Dead workflows should be deleted, not left as scaffolding. The rewrite should start with a clean workflow inventory.

---

## SQLite code is dead but still present

**What happened**: Early development used SQLite for local storage (`storage.py`, `state_store.py`). These were replaced with Supabase equivalents (`storage_supabase.py`, `state_store_supabase.py`). The SQLite versions were never deleted.

**Risk**: Someone might try to run the SQLite version thinking it's equivalent or more current. It isn't.

**Lesson**: Delete abandoned implementations when replacing them. The rewrite should start with a single storage backend.

---

## Model artifact format: pickles are fragile

**What happened**: ML models are serialized as Python pickle files and stored in Supabase Storage. Pickles are tied to the Python version and the version of scikit-learn that created them. If either changes between training and inference, loading the pickle will fail.

**Current mitigation**: The pipeline pins Python and dependency versions in requirements.txt. This works as long as the same versions are used everywhere.

**Risk in the rewrite**: If you update Python or scikit-learn without re-training models, old artifacts will fail to load. The "neutral" fallback (score=3.0) will kick in silently — users won't see an error, just degraded scoring.

**Lesson**: When the rewrite deploys, retrain all project models immediately after. Consider using ONNX or joblib's more stable serialization if longevity matters.

---

## GitHub Actions token failure is invisible to users

**What happened**: When the `GITHUB_TOKEN` is missing, expired, or lacks the `workflow` scope, the API call to dispatch a workflow returns a non-200 status. In the prototype, this was sometimes swallowed — the user clicked "Analyze" and nothing happened.

**Fix**: API routes now check for a valid dispatch response and return an error to the UI. The analysis record is reverted to `status=error` with a message.

**Lesson**: Any operation that depends on an external token (GitHub, Anthropic) should have explicit error surfacing, not silent degradation. The rewrite should treat workflow dispatch failures as hard errors and communicate them clearly.

---

## Training labels accumulate across filter changes without cleanup

**What happened**: Before the training session mechanism was introduced, labels from old filter configurations stayed in the database. The model would train on tenders that no longer matched the project's filters, producing scores that didn't reflect the current configuration.

**Fix**: The `training_session` counter and `migrate_training_scores` RPC drop labels for tenders that don't pass the current filters.

**Lesson**: Training data validity is tied to filter configuration. Any time the filter changes, you need to audit which training labels are still valid. This is a core domain invariant, not just a nice-to-have.

---

## PLACSP document scraping is brittle

**What happened**: The analysis pipeline scrapes PLACSP tender detail pages to find document download links. PLACSP's HTML structure is inconsistent across tender types and has changed without warning.

**Current state**: The scraper works for the common case but breaks on less common tender formats.

**Lesson**: Don't rely on scraping PLACSP HTML for document links if PLACSP provides a more structured way to get them. Check if PLACSP's API or feed data includes document metadata before resorting to HTML parsing.
