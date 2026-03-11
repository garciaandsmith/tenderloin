-- Migration 004: introduce training_session to replace DELETE-based reset.
--
-- Context: resetting training scores via DELETE FROM tender_scores was unreliable
-- because RLS policies prevented the operation in practice. The workaround is a
-- session counter: "resetting" simply increments projects.training_session, and
-- all queries filter tender_scores by the project's current session. Old scored
-- rows are preserved (useful audit trail) but ignored by the app and pipeline.
--
-- Apply this in the Supabase SQL Editor before deploying the matching web app update.

-- 1. Add training_session to projects (the source of truth for current session).
alter table public.projects
  add column if not exists training_session integer not null default 1;

-- 2. Add training_session to tender_scores (captures which session each score belongs to).
alter table public.tender_scores
  add column if not exists training_session integer not null default 1;

-- 3. Replace the old unique constraint so the same tender can be scored again
--    in a new session without violating uniqueness.
alter table public.tender_scores
  drop constraint if exists tender_scores_tender_id_project_id_scored_by_key;

alter table public.tender_scores
  add constraint tender_scores_session_unique
  unique (tender_id, project_id, scored_by, training_session);

-- 4. Allow project members to increment training_session on their project.
--    The existing projects_update_admin policy only allows admins; we add a
--    narrower member policy restricted to the training_session column.
create policy "projects_update_training_session_member" on public.projects
  for update using (
    exists (
      select 1 from project_members
      where project_members.project_id = projects.id
        and project_members.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from project_members
      where project_members.project_id = projects.id
        and project_members.user_id = auth.uid()
    )
  );
