# 07 — Open Questions

Decisions that haven't been made yet and need to be resolved before or early in the rewrite.

---

## 1. What does the AI analysis feature actually look like?

**Current state**: The prototype analyzes tender documents with Claude and produces structured output in two categories: "technical" (services required, technical conditions) and "administrative" (administrative conditions). The approach is being reconsidered.

**What's clear**: 
- Document retrieval (getting all attached files from PLACSP) is needed and should be general-purpose.
- Some AI-assisted summarization is desirable.
- The two-category structure may not be the right one.

**What needs deciding**:
- What questions should the AI answer about a tender document?
- Is the output structured (specific fields) or freeform (a summary)?
- Is the AI prompt per-project (customizable per client) or shared?
- Does analysis run automatically (e.g., when a tender scores above a threshold) or only on user request?

**Why it matters**: The `tender_analysis` table schema, the LLM prompt design, and the UI for displaying results all depend on this. Don't build a new data model for analysis until this is settled.

---

## 2. What's the right pipeline trigger for user-initiated operations?

**Current state**: Retraining, backfill, and analysis are triggered by dispatching GitHub Actions workflows from the web app. This is brittle (token expiry, silent failures, cold-start latency).

**Options**:
A. Keep GitHub Actions, add better error reporting and retry  
B. Postgres-backed job queue with a small always-on worker  
C. Managed task queue service (Inngest, Trigger.dev, etc.)

**Why it matters**: This affects reliability, developer experience, and operational cost. The right answer may differ for "retrain" (runs in seconds, can tolerate latency) vs. "document retrieval" (needs to complete within a user session) vs. "daily capture" (scheduled, no user waiting).

**Suggested approach**: Decide this before building the training loop, since the training trigger is the highest-frequency user-triggered pipeline operation.

---

## 3. What is the minimum label count before showing model scores?

**Current state**: If no model has been trained, tenders receive a neutral score of 3.0. There's no minimum label threshold — in theory, a single training label could trigger a model.

**What needs deciding**:
- How many labeled tenders should be required before the model's scores replace the neutral fallback?
- Should there be a confidence indicator in the UI showing how well-trained the model is (based on label count and cross-validation MAE)?

**Why it matters**: A model trained on 5 labels is essentially noise. Showing those scores as if they're meaningful could mislead users into over-trusting the ranking.

---

## 4. How should filter changes communicate training label loss to users?

**Current state**: When a user changes hard filters, training labels for tenders that no longer pass the new filters are silently invalidated. The user is not told how many labels they're losing.

**What needs deciding**:
- Should the UI show a preview of label loss before the user confirms a filter change? ("Changing this filter will remove 47 training labels.")
- Should there be a confirmation step for filter changes that affect more than N labels?
- Or is silent invalidation acceptable because users rarely think of filter changes and label loss together?

**Why it matters**: This is a UX decision with real impact on user trust and training data quality. Answering it determines the API design for the filter update endpoint.

---

## 5. How will historical data be imported for new projects?

**Current state**: There are two historical import scripts in the prototype. They're functional but weren't designed as a first-class workflow. The intent is to redesign this.

**What needs deciding**:
- What is the source of historical PLACSP data? (Monthly ZIPs going back N years? PLACSP's search API? A one-time dump?)
- How far back should historical data go? (Training on 2-year-old tenders may be less useful than 6-month-old ones.)
- Is historical import a one-time setup step per deployment, or can new projects trigger their own historical backfill?
- What about historical bids from the client (the CSV import)? Is that still needed, or was it a workaround?

**Why it matters**: The ML model is useless without training data. Historical import is a prerequisite for any new project to generate useful scores quickly.

---

## 6. What are the TypeScript type issues hidden by `ignoreBuildErrors`?

**Current state**: `next.config.ts` has `ignoreBuildErrors: true` and `ignoreDuringBuilds: true` (for ESLint). This was added at some point during development and never removed. It masks an unknown number of type errors.

**What needs deciding**: Before the rewrite, it would be worth running `tsc --noEmit` on the prototype to understand what's actually broken. This informs whether the type problems are surface-level (stale Supabase types) or architectural (wrong types used throughout).

**Why it matters**: If the prototype has deep type errors, it's a signal that the data layer abstraction is messy and needs to be redesigned, not just cleaned up.

---

## 7. What's the testing strategy?

**Current state**: No tests exist. The `tests/` directory is empty.

**What needs deciding**:
- What must be tested? (RLS policies, filter logic, ML pipeline, API routes?)
- What can be left untested initially?
- What framework? (pytest for Python, Vitest/Jest for TypeScript)

**Recommended minimum**: 
- Unit tests for the hard filter logic (easy to test, high business impact if wrong)
- Tests for RLS policies (using Supabase's local development environment)
- Integration tests for the capture pipeline (can use a recorded PLACSP response)

---

## 8. Is the `training_session` migration RPC the right implementation?

**Current state**: When filters change, a Postgres RPC (`migrate_training_scores`) runs to drop invalid labels. This is database logic that's invisible to application code.

**Open question**: Is there a case for doing this in application code instead? The trade-off is visibility (application code is easier to test and trace) vs. atomicity (doing it in a transaction in the database is safer).

**This is low urgency** — the current approach works. But the rewrite should consciously decide rather than copy it by default.
