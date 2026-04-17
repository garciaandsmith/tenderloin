-- Add human-readable label columns to tenders_raw, populated by the enrichment
-- pipeline step (pipeline/run_enrich.py).
--
-- The original `region` and `cpv`/`cpv_codes` columns are left untouched so that
-- the filter pipeline's NUTS and CPV prefix-matching logic keeps working correctly.
-- NULL means the row has not yet been enriched; the enrichment step processes
-- NULL rows on each incremental run and all rows on a full rescan.

alter table public.tenders_raw
  add column if not exists region_label text,
  add column if not exists cpv_label    text;
