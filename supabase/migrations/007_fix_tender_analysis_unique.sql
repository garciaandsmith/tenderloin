-- Migration 007: Fix tender_analysis unique constraint to be per-project
--
-- The original constraint UNIQUE (tender_id, analysis_type) was designed when
-- the platform was single-tenant (analysis results were global/shared).
-- After the multi-tenant pivot, project_id was added as a nullable column, but
-- the unique constraint was never updated to include it. This caused silent data
-- corruption: when Project B requested analysis of a tender already analysed by
-- Project A, the upsert would overwrite Project A's record (including project_id),
-- making it invisible to Project A's users via RLS.
--
-- The correct model is per-project analysis: each (tender, analysis_type, project)
-- combination is independent. This also leaves the door open for per-project
-- prompt customisation in the future.

-- 1. Delete any analysis rows where project_id is NULL (orphaned pre-migration
--    records that no user can currently see via RLS anyway).
delete from public.tender_analysis where project_id is null;

-- 2. Make project_id NOT NULL now that orphaned rows are gone.
alter table public.tender_analysis
  alter column project_id set not null;

-- 3. Drop the old (broken) unique constraint.
alter table public.tender_analysis
  drop constraint if exists tender_analysis_tender_id_analysis_type_key;

-- 4. Add the correct per-project unique constraint.
alter table public.tender_analysis
  add constraint tender_analysis_tender_id_analysis_type_project_id_key
    unique (tender_id, analysis_type, project_id);
