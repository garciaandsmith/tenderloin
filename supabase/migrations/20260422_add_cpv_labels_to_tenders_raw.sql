-- Add cpv_labels column to store human-readable labels for all CPV codes on a tender.
-- Complements cpv_label (label for the primary cpv code) and cpv_codes (raw code array).
-- NULL means the row has not yet been enriched by run_enrich.py.

alter table public.tenders_raw
  add column if not exists cpv_labels text[] not null default '{}';
