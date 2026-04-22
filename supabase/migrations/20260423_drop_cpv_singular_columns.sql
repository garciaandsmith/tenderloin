-- Remove the now-redundant singular CPV columns.
--
-- cpv       — was the primary (first) CPV code kept for backward compatibility;
--             all codes are in cpv_codes (text[]) and labels in cpv_labels (text[]).
-- cpv_label — was the human-readable label for the primary code only;
--             replaced by cpv_labels (text[]) which covers every code on the tender.

alter table public.tenders_raw
  drop column if exists cpv,
  drop column if exists cpv_label;
