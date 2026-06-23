# 02 — Design Decisions

Each entry covers: the decision, why it was made, the trade-offs, and whether the rewrite should keep it.

---

## 1. Supabase as the data layer

**Decision**: Use Supabase (hosted Postgres + RLS + Auth + Storage) as the single backend service.

**Why**: Accessibility and speed. Supabase gives a non-programmer a real relational database with auth and file storage without running any infrastructure. The Supabase JS client and dashboard make it approachable.

**Trade-offs**:
- RLS policies are powerful but subtle. Bugs in policy logic are hard to debug and can silently leak data or block legitimate access.
- Supabase's generated TypeScript types drift from the actual schema unless regenerated regularly. In the prototype this was managed with hand-written stubs — a known source of type errors.
- Supabase Storage is not a model registry. Pickle files in a bucket are opaque blobs with no versioning, metadata, or rollback.

**Keep in rewrite?** Yes, at least initially. The core choice is sound. The rewrite should be more disciplined about keeping generated types in sync and treating the Storage bucket as a simple artifact cache, not a registry.

---

## 2. GitHub Actions as the pipeline orchestrator

**Decision**: Use GitHub Actions workflows (scheduled + `workflow_dispatch`) to run the Python pipeline steps.

**Why**: It was the path of least resistance — the code was already in a GitHub repo, secrets management is built in, and there's no additional infrastructure to maintain.

**Trade-offs**:
- GitHub Actions runners have cold-start latency (30–60s before a workflow step begins running).
- The sentence-transformer model (~500 MB) is downloaded on every training run unless cached. Caching is possible with Actions cache but adds workflow complexity.
- Triggering a workflow from the web app requires a `GITHUB_TOKEN` with `workflow` scope. If this token rotates or is revoked, all triggered operations silently fail from the user's perspective.
- Chaining workflows (capture → enrich → filter → score) is done by having each workflow dispatch the next. This is fragile: a failure midway drops the rest of the chain without clear user-visible feedback.
- No retry logic or dead-letter queue. If a workflow fails, it stays failed unless manually re-run.

**Keep in rewrite?** Reconsider. GitHub Actions is fine for the scheduled daily capture. For user-triggered operations (retrain, analysis, backfill), a more reliable trigger mechanism — a queue, a lightweight worker, or a serverless function — would give better error visibility and retry behavior. The current approach is brittle when GitHub infrastructure hiccups or the token expires.

---

## 3. Ridge regression on sentence-transformer embeddings

**Decision**: Encode tender text with `paraphrase-multilingual-MiniLM-L12-v2`, then fit a Ridge regression to predict human affinity scores (0–5).

**Why**: The problem is essentially a ranking/relevance task over Spanish-language text. Sentence-transformers produce good multilingual embeddings out of the box. Ridge regression is simple, fast to train, interpretable in terms of regularization, and works well with small labeled datasets (the expected number of labeled examples per project is in the hundreds, not thousands).

**Alternatives considered (implicitly)**: Keyword scoring, cosine similarity to a "prototype" tender, gradient boosting. These were not pursued — the embedding + regression approach was tried first and gave good early results.

**Trade-offs**:
- The model is per-project and trained from scratch on each project's labels. This means each project needs enough labeled examples before the model outperforms the neutral fallback (score=3.0).
- Model artifacts are pickles. Pickle files are not portable across Python versions and have no security guarantees if loaded from untrusted sources.
- The 500 MB model download on first training run is slow on GitHub Actions without caching.

**Keep in rewrite?** Yes. The approach validated well. In the rewrite, add model caching in the Actions runner and consider adding a minimum-label threshold before showing model scores (e.g., require at least 10 labeled tenders before replacing the neutral fallback).

---

## 4. Training session versioning on filter change

**Decision**: Each project has a `training_session` integer. When filters change, this counter increments and the training labels are re-evaluated: labels for tenders that no longer pass the new filters are dropped from the training set.

**Why**: If a user trains the model on 300 tenders and then removes a CPV code from their filters, some of those 300 tenders are no longer relevant to the project. Keeping their labels would bias the model toward irrelevant content. Incrementing the training session marks the old labels as belonging to a stale configuration.

**Trade-offs**:
- The migration logic (which labels to keep vs. drop) runs via a Supabase RPC (`migrate_training_scores`). This is database logic that's invisible to application code and easy to forget when maintaining.
- Users lose training effort when filters change. If they've scored 300 tenders and change one CPV code, they might lose 50 labels. This isn't surfaced clearly in the UI.

**Keep in rewrite?** Keep the concept — it's correct. Improve the implementation: make the migration transparent (show users how many labels will be affected before they confirm the filter change), and consider surfacing the training session history.

---

## 5. Enrichment at write time (inline during capture)

**Decision**: When a tender is fetched from PLACSP and upserted into `tenders_raw`, the CPV labels and region labels are resolved immediately as part of the same operation.

**Why**: An earlier design had a separate enrichment step after capture. This became a bottleneck and a point of failure — if the enrichment step failed, tenders were in the database without labels, which broke filtering. Moving enrichment inline makes capture atomic.

**Trade-offs**:
- The CPV and region label lookup tables are now a hard dependency of the capture step. If those tables are wrong or incomplete, the capture writes bad labels silently.
- It's harder to re-enrich old tenders if the label definitions change.

**Keep in rewrite?** Yes. The enrichment step workflow (`enrich.yml`) is now effectively a no-op and can be removed. The rewrite should remove that dead workflow rather than keeping it as scaffolding.

---

## 6. Inbox query split into multiple indexed lookups

**Decision**: The inbox query (which tenders to show for a project) is implemented as four sequential indexed queries rather than a single PostgREST join.

**Why**: The original single-query approach using embedded Supabase joins caused PostgreSQL statement timeouts (error 57014) due to full-table scans. Splitting the query into: (1) fetch passing tender IDs from `tender_filter_results`, (2) fetch tender rows, (3) fetch model scores, (4) fetch analysis status — each hits an index and is fast.

**Trade-offs**:
- More application-level code for what could be a single SQL query with the right indexes.
- Four round-trips instead of one (mitigated by the fact that this runs server-side in an API route, not from the browser).

**Keep in rewrite?** Keep the pattern of explicit indexed lookups. But revisit whether the four-step split is still necessary if the schema is redesigned with the right indexes from the start. A well-indexed view or materialized view might allow a clean single query.

---

## 7. AI analysis: structured extraction, not summarization

**Decision**: The AI's job is to extract specific pieces of information from tender documents against a fixed 262-item template (`Template_Evaluacion_de_Pliegos.xlsx`), organized into 12 blocks covering general data, calendar, scope, economics, requirements, team, technical solution, award criteria, documentation, contractual conditions, payment, and risks/penalties.

**Why**: Freeform summaries are hard to act on and hard to compare across tenders. A structured extraction produces a consistent record that can drive go/no-go decisions, flag risks, and pre-populate bid responses — all based on per-project configuration of each template item.

**Replaces**: The prototype's two-category structure (technical / administrative freeform summaries). That structure was too coarse and too implementation-specific.

**Trade-offs**:
- A large extraction template means a large prompt per analysis run. Token cost will be higher than freeform summaries. Plan for this — especially as the template grows toward its final size.
- The template is a living document, built by reviewing real tenders over time. The data model must treat it as versioned: items will be added, renamed, and reorganized. Existing project configurations must survive template updates gracefully.
- Per-project configuration is a sparse selection from the master template. Most items have no project-specific behavior. The data model should reflect this (a sparse config table, not a row per project per item for all 300+ items).

**Document retrieval**: Must fetch all documents attached to a tender (not just specific types). The AI receives whatever is available.

**Keep in rewrite?** Yes — this is the redesigned approach. The prototype's analysis code does not carry forward; build from this spec.

---

## 8. Multi-tenant isolation via RLS

**Decision**: All data access goes through Supabase Row Level Security policies. Users see only data belonging to their projects. Admins see everything.

**Why**: Enforcing isolation at the database level means the application layer can't accidentally leak cross-tenant data. This is especially important for a multi-company SaaS tool.

**Trade-offs**:
- RLS policies are complex SQL. Testing them requires careful attention — standard application tests won't catch policy bugs.
- The admin role bypasses most restrictions, which is powerful but requires careful user provisioning.

**Keep in rewrite?** Absolutely. RLS is the right approach. The rewrite should invest in a proper test suite for the RLS policies specifically.
