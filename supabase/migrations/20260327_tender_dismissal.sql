-- Migration: Add dismissed_at to tender_filter_results
-- Allows users to dismiss (remove) a tender from their project inbox.
-- NULL means not dismissed; a timestamp means the user dismissed it.

ALTER TABLE public.tender_filter_results
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

-- Index to efficiently skip dismissed tenders in inbox queries.
CREATE INDEX IF NOT EXISTS tender_filter_results_dismissed_at_idx
  ON public.tender_filter_results (project_id, dismissed_at)
  WHERE dismissed_at IS NULL;

-- Allow project members and admins to set dismissed_at.
-- Reuses the existing filter_results_update_seen policy (FOR UPDATE) which
-- already permits updates by project members and admins; no new policy needed
-- as dismissed_at is updated through the same UPDATE path.
