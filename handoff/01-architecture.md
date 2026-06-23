# 01 — Architecture

## System shape

Tenderloin has three distinct parts that run independently:

1. **Python pipeline** — runs on a schedule (or on demand) via GitHub Actions. Fetches tenders, processes them, trains models, scores tenders, retrieves documents.
2. **Next.js web app** — the user-facing interface. Reads from and writes to Supabase directly (via RLS-protected queries). Triggers pipeline jobs via GitHub Actions workflow dispatch.
3. **Supabase** — the shared data layer. PostgreSQL database + Row Level Security + Storage (for ML model artifacts) + Auth.

These three parts are loosely coupled. The web app never calls the Python pipeline directly — it writes a record to the database and dispatches a GitHub Actions workflow. The pipeline reads from and writes to the database; it never calls the web app.

## Component map

```
┌─────────────────────────────────────────────────────────────────┐
│                        USERS (browser)                          │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js on Vercel                            │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │ React pages  │  │  API routes  │  │  middleware (auth)  │   │
│  └──────┬───────┘  └──────┬───────┘  └────────────────────┘   │
└─────────┼────────────────┼──────────────────────────────────────┘
          │ Supabase JS     │ GitHub REST API (workflow_dispatch)
          │                 │
          ▼                 ▼
┌──────────────────┐  ┌─────────────────────────────────────────┐
│    Supabase      │  │            GitHub Actions               │
│  ┌────────────┐  │  │  ┌──────────┐  ┌──────────────────┐   │
│  │ PostgreSQL │  │  │  │ capture  │  │ retrain          │   │
│  │ (RLS)      │◄─┼──┼──┤ enrich   │  │ score            │   │
│  └────────────┘  │  │  │ filter   │  │ analysis         │   │
│  ┌────────────┐  │  │  │ score    │  │ backfill         │   │
│  │  Storage   │◄─┼──┼──┤          │  └──────────────────┘   │
│  │ (models)   │  │  │  └──────────┘                         │
│  └────────────┘  │  │      │                                  │
└──────────────────┘  │      ▼                                  │
                       │  Python pipeline                        │
                       │  ┌─────────────────────────────────┐   │
                       │  │ capture / enrich / filter /     │   │
                       │  │ score / train / analysis        │   │
                       │  └──────────────┬──────────────────┘   │
                       │                 │ Anthropic API         │
                       │                 ▼                       │
                       │           Claude (LLM)                  │
                       └─────────────────────────────────────────┘
```

## Data flow: daily pipeline

```
07:00 UTC → capture.yml
  → placsp_client.py fetches Atom feed / monthly ZIP from PLACSP
  → Parse tenders, enrich with CPV labels + region labels inline
  → Upsert into tenders_raw (on conflict: update)
  → Update pipeline_state.last_run_at

→ enrich.yml (chained)
  → [currently a no-op; enrichment happens at write time during capture]

→ filter.yml (chained)
  → For each active project: evaluate every new tender against project_filters
  → Write pass/fail + discard_reasons to tender_filter_results

→ score.yml (chained)
  → For each active project: load model artifact from Supabase Storage
  → For each passed tender: compute model_score (0.0–5.0)
  → Upsert into tender_model_scores
  → Fallback: score=3.0, version="neutral" if no model trained yet
```

## Data flow: user-triggered events

```
User scores a tender (training) →
  POST /api/tenders/{id}/score
  → upsert tender_scores
  → dispatch retrain.yml → pipeline/run_train.py
    → load labels for project from tender_scores
    → encode with sentence-transformer
    → fit Ridge regression → save artifact to Supabase Storage
    → dispatch score.yml to re-score all tenders with new model

User changes project filters →
  PUT /api/projects/{id}/filters
  → upsert project_filters
  → increment project.training_session
  → call RPC migrate_training_scores (drops labels for tenders that no longer pass)
  → dispatch backfill.yml → re-run filter.py on ALL tenders → dispatch score.yml

User requests analysis →
  POST /api/tenders/{id}/process
  → upsert tender_analysis (status=pending)
  → dispatch analysis.yml → pipeline/run_analysis.py
    → fetch PLACSP tender page, scrape document links
    → download documents (PDF, DOCX, PPT)
    → send to Claude API with project-specific prompt
    → update tender_analysis (status=done, results written)
```

## External dependencies

| Dependency | Purpose | Notes |
|---|---|---|
| PLACSP | Tender data source | Spanish public procurement platform. Atom feed for recent; monthly ZIP for bulk. No auth required. |
| Supabase | Database, auth, storage | PostgreSQL + RLS + Storage buckets. Hosted. |
| GitHub Actions | Pipeline orchestration | Scheduled (capture) + webhook-triggered (retrain, analysis, backfill). |
| Anthropic Claude API | Tender document analysis | Called from Python pipeline, not from web app. |
| Vercel | Web app hosting | Auto-deploys on push to main. |
| sentence-transformers | Text embedding for ML | Model: `paraphrase-multilingual-MiniLM-L12-v2` (~500 MB download on first training run). |

## Deployment

- **Web app**: Vercel, auto-deploys on push to `main`.
- **Pipeline**: GitHub Actions. Runs in GitHub-hosted runners (Ubuntu). Dependencies installed fresh per run.
- **Database**: Supabase cloud (hosted Postgres).
- **Model artifacts**: Supabase Storage bucket (`models/`). Stored as pickle files.

## Configuration surface

Environment variables split across two contexts:

**Vercel (web app)**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public Supabase credentials
- `SUPABASE_SERVICE_ROLE_KEY` — used by API routes for elevated access
- `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` — for dispatching workflow runs

**GitHub Actions secrets (pipeline)**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — database access
- `ANTHROPIC_API_KEY` — Claude API
