-- ─────────────────────────────────────────────────────────────────────────────
-- Analysis revamp migration
--
-- 1. Drop superfluous columns from tender_analysis:
--    - technical_conditions  (never written by the current service; dead column)
--    - key_data_summary       (always written as NULL; dead column)
--
-- 2. Add per-project prompt configuration columns to projects:
--    - prompt_technical       (system prompt for technical analysis, NULL = not configured)
--    - prompt_administrative  (system prompt for administrative analysis, NULL = not configured)
--
-- When a prompt column is NULL the application refuses to queue the analysis
-- and shows the user a warning directing them to the configuration page.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tender_analysis
  DROP COLUMN IF EXISTS technical_conditions,
  DROP COLUMN IF EXISTS key_data_summary;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS prompt_technical      TEXT,
  ADD COLUMN IF NOT EXISTS prompt_administrative TEXT;
