# Tenderloin — Public Tender Intelligence for Communication Agencies

Tenderloin helps a communication agency monitor Spain's Public Procurement Platform (PLACSP) systematically. It replaces manual, time-consuming searches with an intelligent triage system that surfaces high-value opportunities.

## Business Goal

Identify public tenders where the agency has a high probability of winning, filtering by contract volume, region, and thematic affinity (CPV codes), based on ~800 scored historical bids.

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
├── config/                 # CPV codes, agency profile, scoring rubric
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

3. **Training**: Users rate tenders (thumbs up/down) to build a labelled dataset for future ML scoring.

4. **AI Scoring** *(planned)*: Classify tender affinity using the historical bid database and agency profile.

5. **Audit** *(planned)*: Deep analysis of tender specs with executive summary generation.

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

## Knowledge Files

| File | Purpose |
|------|---------|
| `config/CodigosCPV.txt` | CPV codes the agency can execute |
| `config/credenciales_agencia.txt` | Agency profile (what we do, what we're good at) |
| `config/scoring.txt` | Definition of each score level (0–5) |
