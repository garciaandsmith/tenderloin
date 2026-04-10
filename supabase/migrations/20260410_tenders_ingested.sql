-- Standalone ingestion table: tenders_ingested
--
-- A parallel ingestion pipeline that correctly handles the versioned-stream
-- nature of PLACSP data.  Key differences from tenders_raw:
--
--   * version_at  — the <updated> timestamp from the XML entry.  Used for
--     conflict resolution: an incoming row only overwrites an existing one when
--     its version_at is strictly newer.
--   * status      — ContractFolderStatusCode extracted from the XML
--                   (PUB, ADJ, FOR, EV, AN, …).
--   * ingested_at — when this pipeline last wrote/updated the row.

create table if not exists public.tenders_ingested (
  id              bigserial       primary key,
  external_id     text            not null,
  source          text            not null default 'placsp',
  version_at      timestamptz     not null,
  title           text            not null default '',
  summary         text            not null default '',
  link            text            not null default '',
  published_at    timestamptz,
  deadline_at     timestamptz,
  buyer_name      text            not null default '',
  region          text            not null default '',
  cpv             text            not null default '',
  budget_amount   numeric,
  contract_type   text,
  procedure_type  text,
  buyer_type      text,
  lot_count       integer,
  duration_months integer,
  status          text,
  ingested_at     timestamptz     not null default now(),
  unique (external_id, source)
);

-- Indexes
create index if not exists idx_tenders_ingested_published
  on public.tenders_ingested (published_at desc);

create index if not exists idx_tenders_ingested_deadline
  on public.tenders_ingested (deadline_at);

create index if not exists idx_tenders_ingested_version
  on public.tenders_ingested (version_at desc);

create index if not exists idx_tenders_ingested_cpv
  on public.tenders_ingested (cpv);

create index if not exists idx_tenders_ingested_region
  on public.tenders_ingested (region);

-- Row-level security
alter table public.tenders_ingested enable row level security;

create policy "tenders_ingested_select"
  on public.tenders_ingested for select
  to authenticated
  using (true);

create policy "tenders_ingested_service_role"
  on public.tenders_ingested for all
  to service_role
  using (true);
