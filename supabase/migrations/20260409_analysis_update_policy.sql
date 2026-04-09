-- Migration: Add UPDATE RLS policy to tender_analysis
--
-- Root cause: tender_analysis had SELECT and INSERT RLS policies but no UPDATE
-- policy. PostgreSQL enforces RLS on the UPDATE path of INSERT ... ON CONFLICT
-- DO UPDATE (upsert). When an analysis row already existed (status 'done' or
-- 'error'), the upsert in POST /api/tenders/[id]/process attempted an UPDATE,
-- which was denied by RLS, returning a 500 "Error al crear el análisis".
--
-- The same missing policy also silently blocked the revertToError() helper
-- in that same route, which calls .update() after a GitHub dispatch failure.

create policy "analysis_update" on public.tender_analysis
  for update
  using  (is_project_member(project_id) or is_admin())
  with check (is_project_member(project_id) or is_admin());
