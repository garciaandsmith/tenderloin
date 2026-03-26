-- =============================================================
-- Migration: filter versioning + inbox_seen_at tracking
-- Run this in the Supabase SQL Editor.
-- =============================================================

-- 1. Track which filter version was used when evaluating each project's filters.
ALTER TABLE public.project_filters
  ADD COLUMN IF NOT EXISTS filter_version integer NOT NULL DEFAULT 1;

-- 2. Store the filter version used to produce each filter result row.
ALTER TABLE public.tender_filter_results
  ADD COLUMN IF NOT EXISTS filter_version integer NOT NULL DEFAULT 1;

-- 3. Record when a tender was first opened from the inbox (per project).
--    NULL means never opened. Used to decide whether to keep training
--    scores when a filter change would otherwise exclude this tender.
ALTER TABLE public.tender_filter_results
  ADD COLUMN IF NOT EXISTS inbox_seen_at timestamptz;

-- 4. Allow project members (and admins) to update inbox_seen_at.
--    The pipeline already bypasses RLS via service_role.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'tender_filter_results'
      AND policyname = 'filter_results_update_seen'
  ) THEN
    CREATE POLICY "filter_results_update_seen"
      ON public.tender_filter_results
      FOR UPDATE
      USING   (is_project_member(project_id) OR is_admin())
      WITH CHECK (is_project_member(project_id) OR is_admin());
  END IF;
END $$;

-- 5. Atomically increment a project's training_session and return the new value.
CREATE OR REPLACE FUNCTION public.increment_training_session(p_project_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_session integer;
BEGIN
  UPDATE public.projects
  SET training_session = training_session + 1
  WHERE id = p_project_id
  RETURNING training_session INTO new_session;
  RETURN new_session;
END;
$$;

-- 6. Migrate training scores from a previous filter session to the new one.
--    Only scores for tenders that STILL pass the new filter are carried over.
--    Scores that would conflict with an existing row in the new session are skipped.
CREATE OR REPLACE FUNCTION public.migrate_training_scores(
  p_project_id  uuid,
  p_from_session integer,
  p_to_session   integer
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.tender_scores ts
  SET    training_session = p_to_session
  WHERE  ts.training_session = p_from_session
    AND  ts.project_id = p_project_id
    AND  ts.tender_id IN (
           SELECT tender_id
           FROM   public.tender_filter_results
           WHERE  project_id = p_project_id
             AND  passed = true
         )
    -- skip if the new session already has a score for this (tender, user) pair
    AND NOT EXISTS (
           SELECT 1 FROM public.tender_scores ts2
           WHERE  ts2.tender_id        = ts.tender_id
             AND  ts2.project_id       = ts.project_id
             AND  ts2.scored_by        = ts.scored_by
             AND  ts2.training_session = p_to_session
         );
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;
