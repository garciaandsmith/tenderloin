-- =============================================================
-- TENDERLOIN — Supabase PostgreSQL Schema
-- Run this in the Supabase SQL Editor to bootstrap the database.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- PROFILES (extends Supabase Auth users)
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  role        text not null default 'user' check (role in ('admin', 'user')),
  full_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create profile row on signup.
-- The very first user to register becomes 'admin'; everyone else defaults to 'user'.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
begin
  select case when count(*) = 0 then 'admin' else 'user' end
    into v_role
    from public.profiles;

  insert into public.profiles (id, email, role)
  values (new.id, new.email, v_role);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- PROJECTS
-- ─────────────────────────────────────────────────────────────
create table public.projects (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  description       text,
  created_by        uuid not null references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  is_active         boolean not null default true,
  training_session  integer not null default 1
);

-- ─────────────────────────────────────────────────────────────
-- PROJECT_MEMBERS (many users ↔ many projects)
-- ─────────────────────────────────────────────────────────────
create table public.project_members (
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- ─────────────────────────────────────────────────────────────
-- PROJECT_FILTERS (hard filter config per project)
-- ─────────────────────────────────────────────────────────────
create table public.project_filters (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null unique references public.projects(id) on delete cascade,
  budget_min           numeric,
  budget_max           numeric,
  regions              text[],     -- NUTS codes e.g. {'ES3','ES51'}
  cpv_codes            text[],     -- prefix match e.g. {'79416','79340'}
  contract_types       text[],     -- 'services','supplies','works','concession'
  procedure_types      text[],     -- 'open','restricted','negotiated','minor'
  keywords_include     text[],     -- title/summary must match ANY
  keywords_exclude     text[],     -- title/summary must match NONE
  buyer_types          text[],     -- 'central_government','autonomous_community','local_entity','public_entity'
  max_lot_count        integer,    -- ignore tenders with more lots than this
  min_contract_months  integer,
  max_contract_months  integer,
  updated_at           timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- TENDERS_RAW (mirrors SQLite tenders_raw + extra fields for future phases)
-- ─────────────────────────────────────────────────────────────
create table public.tenders_raw (
  id              bigserial primary key,
  external_id     text not null,
  title           text not null,
  summary         text not null,
  link            text not null,
  published_at    timestamptz not null,
  deadline_at     timestamptz,
  buyer_name      text not null,
  region          text not null,
  cpv             text not null,
  budget_amount   numeric,
  source          text not null default 'placsp',
  status          text,                            -- e.g. 'PUB','ADJ','FOR','EV','AN'
  created_at      timestamptz not null default now(),
  -- extended fields for later pipeline stages
  contract_type   text,
  procedure_type  text,
  lot_count       integer,
  duration_months integer,
  buyer_type      text,
  unique (external_id, source)
);

create index tenders_raw_published_at_idx on public.tenders_raw (published_at desc);
create index tenders_raw_deadline_at_idx  on public.tenders_raw (deadline_at);
create index tenders_raw_cpv_idx          on public.tenders_raw (cpv);
create index tenders_raw_region_idx       on public.tenders_raw (region);

-- ─────────────────────────────────────────────────────────────
-- PIPELINE_STATE (mirrors SQLite pipeline_state)
-- ─────────────────────────────────────────────────────────────
create table public.pipeline_state (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- TENDER_SCORES (human labels from the Training section)
-- ─────────────────────────────────────────────────────────────
create table public.tender_scores (
  id                bigserial primary key,
  tender_id         bigint not null references public.tenders_raw(id) on delete cascade,
  project_id        uuid not null references public.projects(id) on delete cascade,
  scored_by         uuid not null references public.profiles(id),
  score             smallint not null check (score between 0 and 5),
  scored_at         timestamptz not null default now(),
  training_session  integer not null default 1,
  unique (tender_id, project_id, scored_by, training_session)
);

-- ─────────────────────────────────────────────────────────────
-- TENDER_MODEL_SCORES (output of Python ML scoring pipeline)
-- ─────────────────────────────────────────────────────────────
create table public.tender_model_scores (
  id            bigserial primary key,
  tender_id     bigint not null references public.tenders_raw(id) on delete cascade,
  project_id    uuid not null references public.projects(id) on delete cascade,
  model_score   numeric(4,3) not null,  -- 0.000–5.000
  model_version text not null,
  scored_at     timestamptz not null default now(),
  unique (tender_id, project_id, model_version)
);

-- ─────────────────────────────────────────────────────────────
-- TENDER_FILTER_RESULTS (which tenders pass each project's hard filters)
-- ─────────────────────────────────────────────────────────────
create table public.tender_filter_results (
  id              bigserial primary key,
  tender_id       bigint not null references public.tenders_raw(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  passed          boolean not null,
  discard_reasons text[],  -- e.g. {'budget_below_min','region_mismatch'}
  evaluated_at    timestamptz not null default now(),
  unique (tender_id, project_id)
);

-- ─────────────────────────────────────────────────────────────
-- TENDER_ANALYSIS (Phase 2: deep analysis output)
-- ─────────────────────────────────────────────────────────────
create table public.tender_analysis (
  id                        bigserial primary key,
  tender_id                 bigint not null references public.tenders_raw(id),
  analysis_type             text not null check (analysis_type in ('technical', 'administrative')),
  project_id                uuid not null references public.projects(id),
  triggered_by              uuid references public.profiles(id),
  status                    text not null default 'pending'
                              check (status in ('pending','running','done','error')),
  key_data_summary          text,
  services_required         text,
  technical_conditions      text,
  administrative_conditions text,
  attached_files            jsonb,  -- [{name, url, type}]
  raw_llm_output            jsonb,
  triggered_at              timestamptz not null default now(),
  completed_at              timestamptz,
  unique (tender_id, analysis_type, project_id)
);

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

alter table public.profiles             enable row level security;
alter table public.projects             enable row level security;
alter table public.project_members      enable row level security;
alter table public.project_filters      enable row level security;
alter table public.tenders_raw          enable row level security;
alter table public.pipeline_state       enable row level security;
alter table public.tender_scores        enable row level security;
alter table public.tender_model_scores  enable row level security;
alter table public.tender_filter_results enable row level security;
alter table public.tender_analysis      enable row level security;

-- ── Helper functions ─────────────────────────────────────────

create or replace function public.is_admin()
returns boolean language sql security definer as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.is_project_member(p_project_id uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = auth.uid()
  );
$$;

-- ── PROFILES ─────────────────────────────────────────────────
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or is_admin());

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- ── PROJECTS ─────────────────────────────────────────────────
create policy "projects_select_admin" on public.projects
  for select using (is_admin());

create policy "projects_select_member" on public.projects
  for select using (is_project_member(id));

create policy "projects_insert_admin" on public.projects
  for insert with check (is_admin());

create policy "projects_update_admin" on public.projects
  for update using (is_admin());

create policy "projects_delete_admin" on public.projects
  for delete using (is_admin());

create policy "projects_update_training_session_member" on public.projects
  for update using (is_project_member(id))
  with check (is_project_member(id));

-- ── PROJECT_MEMBERS ──────────────────────────────────────────
create policy "members_select" on public.project_members
  for select using (user_id = auth.uid() or is_admin());

create policy "members_write_admin" on public.project_members
  for all using (is_admin());

-- ── PROJECT_FILTERS ──────────────────────────────────────────
create policy "filters_all_admin" on public.project_filters
  for all using (is_admin());

create policy "filters_select_member" on public.project_filters
  for select using (is_project_member(project_id));

-- ── TENDERS_RAW ──────────────────────────────────────────────
-- Any authenticated user can read; only service_role can write (Python script bypasses RLS)
create policy "tenders_select_authenticated" on public.tenders_raw
  for select using (auth.uid() is not null);

-- ── PIPELINE_STATE ───────────────────────────────────────────
create policy "pipeline_state_select_authenticated" on public.pipeline_state
  for select using (auth.uid() is not null);

-- ── TENDER_SCORES ────────────────────────────────────────────
create policy "tender_scores_select" on public.tender_scores
  for select using (is_project_member(project_id) or is_admin());

create policy "tender_scores_insert" on public.tender_scores
  for insert with check (is_project_member(project_id) and scored_by = auth.uid());

create policy "tender_scores_delete_project_member" on public.tender_scores
  for delete using (
    exists (
      select 1 from project_members
      where project_members.project_id = tender_scores.project_id
        and project_members.user_id = auth.uid()
    )
  );

-- ── TENDER_MODEL_SCORES ──────────────────────────────────────
create policy "model_scores_select" on public.tender_model_scores
  for select using (is_project_member(project_id) or is_admin());

-- ── TENDER_FILTER_RESULTS ────────────────────────────────────
create policy "filter_results_select" on public.tender_filter_results
  for select using (is_project_member(project_id) or is_admin());

-- ── TENDER_ANALYSIS ──────────────────────────────────────────
create policy "analysis_select" on public.tender_analysis
  for select using (is_project_member(project_id) or is_admin());

create policy "analysis_insert" on public.tender_analysis
  for insert with check (is_project_member(project_id) and triggered_by = auth.uid());

create policy "analysis_update" on public.tender_analysis
  for update
  using  (is_project_member(project_id) or is_admin())
  with check (is_project_member(project_id) or is_admin());

-- ── TENDERS_INGESTED ─────────────────────────────────────────
-- Standalone ingestion pipeline table. Parallel to tenders_raw but with
-- correct version-aware upserts and richer field extraction.
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

alter table public.tenders_ingested enable row level security;

create policy "tenders_ingested_select"
  on public.tenders_ingested for select to authenticated using (true);

create policy "tenders_ingested_service_role"
  on public.tenders_ingested for all to service_role using (true);
