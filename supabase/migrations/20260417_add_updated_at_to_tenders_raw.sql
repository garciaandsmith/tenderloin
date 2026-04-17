alter table public.tenders_raw
  add column if not exists updated_at timestamptz;
