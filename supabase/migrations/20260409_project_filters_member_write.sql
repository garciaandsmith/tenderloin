-- Migration: allow project members to insert and update their project's filters.
--
-- The original schema only granted SELECT to members; all writes were admin-only.
-- The API route enforces application-level auth (admin OR project member), but the
-- user-scoped Supabase client is blocked by the missing INSERT/UPDATE policy.
--
-- Run this in the Supabase SQL Editor.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'project_filters'
      AND policyname = 'filters_write_member'
  ) THEN
    CREATE POLICY "filters_write_member" ON public.project_filters
      FOR ALL
      USING   (is_project_member(project_id))
      WITH CHECK (is_project_member(project_id));
  END IF;
END $$;
