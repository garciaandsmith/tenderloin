-- ============================================================
-- Tenderloin — Initial schema
-- Apply in: Supabase Dashboard > SQL Editor
-- ============================================================

create extension if not exists "uuid-ossp";

-- ── Organizations (tenants) ──────────────────────────────────
create table organizations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ── User profiles (extends Supabase auth.users) ──────────────
create table profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  organization_id  uuid references organizations(id) on delete set null,
  display_name     text,
  created_at       timestamptz not null default now()
);

-- ── Projects ─────────────────────────────────────────────────
create table projects (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null,
  description      text,
  created_at       timestamptz not null default now()
);

-- ── Hard filter config per project ───────────────────────────
create table project_filters (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null unique references projects(id) on delete cascade,
  budget_min_eur  numeric not null default 40000,
  regions         text[] not null default array['ES30'],
  cpv_codes       text[] not null default array[]::text[],
  updated_at      timestamptz not null default now()
);

-- ── Global raw tender pool (shared across all tenants) ───────
create table tenders_raw (
  id            bigserial primary key,
  external_id   text not null,
  source        text not null default 'placsp',
  title         text not null,
  summary       text not null default '',
  link          text not null,
  published_at  timestamptz,
  deadline_at   timestamptz,
  buyer_name    text not null default '',
  region        text not null default '',
  cpv           text not null default '',
  budget_amount numeric,
  captured_at   timestamptz not null default now(),
  unique (external_id, source)
);

-- ── Per-project filter results ────────────────────────────────
create table project_tenders (
  id              bigserial primary key,
  project_id      uuid not null references projects(id) on delete cascade,
  tender_raw_id   bigint not null references tenders_raw(id) on delete cascade,
  passed_filter   boolean not null,
  discard_reason  text,
  filtered_at     timestamptz not null default now(),
  unique (project_id, tender_raw_id)
);

-- ── Training labels (user scores 0-5) ────────────────────────
create table tender_labels (
  id             bigserial primary key,
  project_id     uuid not null references projects(id) on delete cascade,
  tender_raw_id  bigint not null references tenders_raw(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  score          smallint not null check (score between 0 and 5),
  notes          text,
  labeled_at     timestamptz not null default now(),
  unique (project_id, tender_raw_id, user_id)
);

-- ── Inbox (passes hard + intelligent filter) ─────────────────
create table project_inbox (
  id             bigserial primary key,
  project_id     uuid not null references projects(id) on delete cascade,
  tender_raw_id  bigint not null references tenders_raw(id) on delete cascade,
  smart_score    numeric not null,
  score_method   text not null default 'baseline', -- 'baseline' | 'knn'
  is_read        boolean not null default false,
  added_at       timestamptz not null default now(),
  unique (project_id, tender_raw_id)
);

-- ── Deep analysis requests ────────────────────────────────────
create table analyses (
  id             uuid primary key default uuid_generate_v4(),
  project_id     uuid not null references projects(id) on delete cascade,
  tender_raw_id  bigint not null references tenders_raw(id) on delete cascade,
  requested_by   uuid not null references auth.users(id),
  status         text not null default 'pending', -- pending | processing | done | error
  result_json    jsonb,
  requested_at   timestamptz not null default now(),
  completed_at   timestamptz
);

-- ── Ingestion state ───────────────────────────────────────────
create table ingestion_state (
  source          text primary key,
  last_run_at     timestamptz,
  last_run_count  int
);

-- ── Row Level Security ────────────────────────────────────────
alter table organizations   enable row level security;
alter table profiles        enable row level security;
alter table projects        enable row level security;
alter table project_filters enable row level security;
alter table tenders_raw     enable row level security;
alter table project_tenders enable row level security;
alter table tender_labels   enable row level security;
alter table project_inbox   enable row level security;
alter table analyses        enable row level security;

-- Helper: get caller's organization_id
create or replace function my_org_id()
returns uuid language sql stable security definer as $$
  select organization_id from profiles where id = auth.uid()
$$;

-- profiles: own record only
create policy "profiles: own" on profiles
  for all using (id = auth.uid());

-- organizations: only own org
create policy "organizations: own org" on organizations
  for select using (id = my_org_id());

create policy "organizations: insert own" on organizations
  for insert with check (true); -- allowed at registration, scoped in app

-- projects: full CRUD within own org
create policy "projects: own org" on projects
  for all using (organization_id = my_org_id());

-- project_filters
create policy "project_filters: own org" on project_filters
  for all using (
    project_id in (select id from projects where organization_id = my_org_id())
  );

-- tenders_raw: readable by any authenticated user
create policy "tenders_raw: authenticated read" on tenders_raw
  for select using (auth.uid() is not null);

-- project_tenders
create policy "project_tenders: own org" on project_tenders
  for all using (
    project_id in (select id from projects where organization_id = my_org_id())
  );

-- tender_labels: read all in own org; write/update own rows only
create policy "tender_labels: read org" on tender_labels
  for select using (
    project_id in (select id from projects where organization_id = my_org_id())
  );

create policy "tender_labels: insert own" on tender_labels
  for insert with check (user_id = auth.uid());

create policy "tender_labels: update own" on tender_labels
  for update using (user_id = auth.uid());

-- project_inbox
create policy "project_inbox: own org" on project_inbox
  for all using (
    project_id in (select id from projects where organization_id = my_org_id())
  );

-- analyses
create policy "analyses: own org" on analyses
  for all using (
    project_id in (select id from projects where organization_id = my_org_id())
  );

-- ── Auto-create profile on signup ────────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
