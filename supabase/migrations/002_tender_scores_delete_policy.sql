-- Migration 002: add DELETE policy to tender_scores so users can reset their training data.
--
-- Root cause: tender_scores had RLS enabled but no DELETE policy. Supabase silently
-- skips rows when no policy permits the operation, returning success with 0 rows deleted.
-- This caused "Reiniciar entrenamiento" to appear to work (no error returned) but leave
-- all scores intact.
--
-- Fix: allow a user to delete their own scores (scored_by = auth.uid()).

create policy "tender_scores_delete" on public.tender_scores
  for delete using (scored_by = auth.uid());
