-- Migration 003: replace per-user DELETE policy with a project-member DELETE policy.
--
-- Context: "Reiniciar entrenamiento" is a project-wide action that should wipe all
-- training scores for a project so the model can be retrained from scratch.
-- The original per-user policy (migration 002) only allowed users to delete their
-- own rows, which meant the reset was incomplete when multiple team members had scored.
--
-- Fix: any project member can delete any score row belonging to their project.
-- Authentication is still enforced — the user must be authenticated AND be a member
-- of the project whose scores are being deleted.
--
-- Apply this in the Supabase SQL editor before deploying the matching web app update.

drop policy if exists "tender_scores_delete" on public.tender_scores;

create policy "tender_scores_delete_project_member" on public.tender_scores
  for delete using (
    exists (
      select 1 from project_members
      where project_members.project_id = tender_scores.project_id
        and project_members.user_id = auth.uid()
    )
  );
