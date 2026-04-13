-- Add cpv_codes array column to tenders_raw so the capture pipeline can store
-- all CPV codes attached to a tender (PLACSP entries often carry more than one).
-- The primary `cpv` text column is kept for backward compatibility.

alter table public.tenders_raw
  add column if not exists cpv_codes text[] not null default '{}';

create index if not exists tenders_raw_cpv_codes_idx
  on public.tenders_raw using gin (cpv_codes);
