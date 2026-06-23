# 00 — Overview

## What it is

Tenderloin is a public procurement monitoring tool for communication agencies operating in Spain. It tracks tenders published on PLACSP (Plataforma de Contratación del Sector Público), filters them by each client's criteria, ranks them by predicted win probability using a trained ML model, and surfaces the most relevant ones in a project inbox.

The intended usage model is **assisted SaaS**: a professional (consultant or account manager) sets up the tool for each client company, guides them through configuration and training, and helps interpret results. End users are not expected to be technical.

## Who it's for

- **Client companies**: communication agencies that bid on public contracts. Each company has one or more "projects" (typically one per line of business or bidding team).
- **The professional**: someone who onboards clients, configures filters, runs the initial training session, and monitors the tool's health. Think of this person as an internal operator, not the end customer.

## Current state

The prototype was vibe-coded over several months and has reached a point of functional completeness that reveals what the right design should be. It works, but carries accumulated technical debt, leftover scaffolding from earlier iterations, and some structural decisions that would have been made differently with hindsight. The goal of this handoff is to enable a clean rewrite using what was learned.

### What works

- Daily automated capture of tenders from PLACSP (Atom feed + monthly ZIP)
- Hard filter configuration (budget, region, CPV codes, contract type, keywords, etc.)
- ML-based affinity scoring using sentence-transformer embeddings + Ridge regression
- Training interface: users score historical tenders 0–5 to teach the model
- Model retraining triggered automatically when new training labels are added
- Project inbox sorted by model score, with dismissed/seen state tracking
- Row-level security enforcing multi-tenant data isolation in Supabase
- GitHub Actions pipeline orchestrating capture → enrich → filter → score daily

### What's incomplete or deprioritized

- **Document retrieval**: currently only fetches the "technical" and "administrative" documents for LLM analysis. Should retrieve *all* documents attached to a tender. This part of the pipeline will be redesigned anyway.
- **AI analysis of tender specs**: the LLM-based technical/administrative analysis feature exists but the approach is being reconsidered. Keep the infrastructure light here in the rewrite — what matters is general document retrieval, not the specific two-analysis structure.
- **Tests**: the `tests/` directory is empty. There are no automated tests.
- **Type safety**: `ignoreBuildErrors: true` in Next.js config suggests type errors exist. The Supabase-generated types may be stale or incomplete.
- **Historical data import**: the import workflow needs rethinking. The rewrite should include a proper way to load historical tenders (for training), not just the daily live feed.

## Scope boundaries

The app is Spain-specific for now (PLACSP only, Spanish CPV/NUTS codes). There's no public signup — access is provisioned by the operator.
