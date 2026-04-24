-- Unblock the daily capture pipeline while the DROP COLUMN migration is pending.
--
-- The Python pipeline no longer writes the `cpv` column (removed in the
-- multiple-cpv-codes refactor); the capture job therefore inserts new rows
-- without providing a value, which violates the NOT NULL constraint on `cpv`.
--
-- Making `cpv` nullable allows upserts to succeed immediately.  Run
-- 20260423_drop_cpv_singular_columns.sql afterwards to finish the clean-up.

alter table public.tenders_raw
  alter column cpv drop not null;
