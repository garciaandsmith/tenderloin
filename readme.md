# Tenderloin — Public Tender Intelligence Platform

Tenderloin helps communication agencies monitor Spain's Public Procurement Platform (PLACSP) systematically. It replaces manual, time-consuming searches with an intelligent triage system that surfaces high-value opportunities across multiple accounts and projects.

## Business Goal

Identify public tenders with a high probability of winning, filtering by contract volume, region, and thematic affinity (CPV codes), then scoring them with ML models trained on each project's own labeled bid history.

## Project Structure

```
tenderloin/
├── pipeline/               # Capture pipeline (Python)
│   ├── run_capture.py      # Entry point — run daily via GitHub Actions
│   └── capture/            # Modules: client, service, storage, state store
├── app/                    # Web application (Next.js App Router)
│   ├── (auth)/             # Login page and auth layout
│   ├── (app)/              # Protected app: dashboard, projects, inbox, training
│   └── api/                # API routes (projects, tenders, auth, pipeline)
├── components/             # React components (shadcn/ui + custom)
├── lib/                    # Supabase client, types, queries, utilities
├── data/                   # Historical bids (CSV)
├── supabase/               # Database migrations
└── tests/                  # Python unit tests
```

## Tech Stack

- **Capture pipeline**: Python 3.12, runs daily via GitHub Actions, stores tenders in Supabase PostgreSQL
- **Web app**: Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, deployed on Vercel
- **Database / Auth**: Supabase (PostgreSQL + Row Level Security + Auth)

## How It Works

1. **Capture**: GitHub Actions runs `python pipeline/run_capture.py` daily at 07:00 UTC. It fetches new tenders from the PLACSP Atom feed and upserts them into the `tenders_raw` table in Supabase.

2. **Inbox**: The web app shows incoming tenders per project. Each tender is pre-filtered against the project's configured CPV codes, regions, and budget range.

3. **Training**: Users rate tenders (thumbs up/down) to build a labelled dataset for ML scoring.

4. **AI Scoring**: Classifies tender affinity using a per-project ML model trained on the project's labeled bid history (sentence-transformers embeddings + scikit-learn regression).

5. **Analysis** *(in progress)*: Deep analysis of high-value tender specs (score 4–5) with structured LLM summaries covering key data, required services, technical requirements, and administrative requirements.

## Setup

### Environment variables (Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### Environment variables (GitHub Actions secrets)

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Local development

```bash
npm install
cp .env.example .env.local  # fill in your Supabase credentials
npm run dev
```

### Run the capture pipeline locally

```bash
pip install -r pipeline/requirements.txt
python pipeline/run_capture.py --source-url file://data/sample.json
```
