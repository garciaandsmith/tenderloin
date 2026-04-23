-- Partial indexes that make the two enrichment SELECT passes index-scan instead
-- of full-table-scan, preventing statement timeout (PostgreSQL error 57014).
--
-- Pass 1 fetches rows where region_label IS NULL (never enriched).
-- Pass 2 fetches rows that have CPV codes but no CPV labels yet (backfill).
-- Both paginate by ascending id, so the index covers (id) over the matching subset.

create index if not exists tenders_raw_enrich_pass1_idx
    on public.tenders_raw (id)
    where region_label is null;

create index if not exists tenders_raw_enrich_pass2_idx
    on public.tenders_raw (id)
    where cpv_codes != '{}' and cpv_labels = '{}';
