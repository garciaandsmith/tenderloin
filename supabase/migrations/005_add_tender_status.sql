-- Add status field to tenders_raw to store the tender's state from PLACSP
-- e.g. 'PUB' (Publicada), 'ADJ' (Adjudicada), 'FOR' (Formalizada), 'EV' (En evaluación), 'AN' (Anulada)
alter table public.tenders_raw
  add column if not exists status text;
