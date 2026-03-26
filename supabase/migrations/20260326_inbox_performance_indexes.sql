-- Migration: Add performance indexes for inbox query
--
-- The getInboxTenders() function was timing out (PostgreSQL error 57014)
-- because PostgREST's embedded join syntax executes correlated subqueries
-- against tender_model_scores and tender_analysis without any indexes on
-- tender_id. These indexes reduce each lookup from a full table scan to
-- an index scan.

-- Index for project-scoped model score lookups (used in Step 3 of getInboxTenders)
CREATE INDEX IF NOT EXISTS tender_model_scores_project_tender_idx
  ON public.tender_model_scores (project_id, tender_id);

-- Index for project-scoped analysis status lookups (used in Step 4 of getInboxTenders)
CREATE INDEX IF NOT EXISTS tender_analysis_project_tender_idx
  ON public.tender_analysis (project_id, tender_id);

-- Index for Step 1 of getInboxTenders: filter by project + passed, order by tender_id DESC
CREATE INDEX IF NOT EXISTS tender_filter_results_project_passed_idx
  ON public.tender_filter_results (project_id, passed, tender_id DESC);
