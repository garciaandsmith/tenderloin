-- Migration 006: Separate tender analysis into technical and administrative types
--
-- Adds an `analysis_type` column ('technical' | 'administrative') to
-- tender_analysis so that each type can be triggered and processed independently.
-- The old unique constraint on (tender_id) is replaced by (tender_id, analysis_type).

-- 1. Add the new column (nullable for now so existing rows don't break)
alter table public.tender_analysis
  add column if not exists analysis_type text
    check (analysis_type in ('technical', 'administrative'));

-- 2. Back-fill existing rows as 'technical' (closest match to original behaviour)
update public.tender_analysis
  set analysis_type = 'technical'
  where analysis_type is null;

-- 3. Make the column non-nullable
alter table public.tender_analysis
  alter column analysis_type set not null;

-- 4. Drop the old unique constraint on tender_id alone …
alter table public.tender_analysis
  drop constraint if exists tender_analysis_tender_id_key;

-- 5. … and replace it with a composite unique constraint
alter table public.tender_analysis
  add constraint tender_analysis_tender_id_analysis_type_key
    unique (tender_id, analysis_type);
