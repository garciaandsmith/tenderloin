# 07 — Open Questions

Decisions that haven't been made yet, and decisions recently resolved. Both recorded here so the rewrite team has the full picture.

---

## RESOLVED

### R1. What does the AI analysis feature look like?

**Decision**: The AI's job is structured information extraction against a fixed template, not freeform summarization.

The template (`Template_Evaluacion_de_Pliegos.xlsx`) contains **262 items** across **12 blocks**:

| Block | Items |
|---|---|
| Datos generales de la licitación | 26 |
| Calendario y procedimiento | 20 |
| Objeto y alcance del contrato | 19 |
| Condiciones económicas | 19 |
| Requisitos para licitar | 22 |
| Equipo y recursos exigidos | 16 |
| Solución técnica requerida | 28 |
| Criterios de adjudicación | 21 |
| Documentación a presentar | 24 |
| Condiciones contractuales | 26 |
| Condiciones de pago y tesorería | 20 |
| Riesgos, penalidades y alertas | 21 |

For each item, the AI searches the tender documents and records what it finds (or "not specified"). The template is the same for all tenders; the per-project configuration is what each project *does* with the extracted values:

- **Auto-fill items**: values the project can answer from their own data (team size, certifications, etc.) — used to populate a bid response
- **Go/no-go items**: items whose extracted value is compared against a project threshold — if the condition isn't met, the tender is flagged
- **Red flag items**: items that, if present, indicate a serious risk or disqualifier

**Implications for the data model**:
- `tender_analysis` needs to store extracted values per item, not freeform text categories
- Project configuration needs a per-item settings layer (auto-fill value, go/no-go rule, red flag condition)
- The extraction template itself should be versioned and stored (it will evolve)

**Document retrieval**: Must be general-purpose — retrieve all documents attached to a tender (not just "technical" and "administrative"). The AI will analyze whatever is provided.

**Trigger**: Analysis should be as automated as possible. The prototype required the user to manually trigger it per tender. The rewrite should trigger analysis automatically (e.g., when a tender crosses a score threshold, or when it enters the inbox).

See `05-domain-logic.md` for the full domain description of this feature.

---

### R2. How should filter changes communicate training label loss to users?

**Decision**: After a filter change is saved, show the user a message indicating:
- How many training labels were discarded
- How many remain in the current training session
- An encouragement to continue training to compensate for the loss

This is a post-save notification, not a pre-save confirmation step. The filter change goes through; the user is then informed of its effect on training data.

**Implication**: The filter update endpoint must return label counts (before and after) alongside the updated filter configuration. The UI renders a contextual message, not an alert or blocking dialog.

---

### R3. What is the training Submit flow?

**Decision**: The training interface has a **Submit button** that the user presses to indicate they've finished a scoring session. This triggers model retraining. Analysis pipeline updates should be as automated as possible (not manually triggered per item).

**Implication**: Retraining is not triggered on every individual label — it's triggered on explicit Submit. This is better for performance (one retrain per session, not one per label) and gives users a clear sense of "committing" their work. The UI should show how many tenders have been scored in the current session and what the Submit action will do.

---

## OPEN

### 1. What is the minimum label count before showing model scores?

**Current state**: If no model has been trained, tenders receive a neutral score of 3.0. There's no minimum label threshold — in theory, a single training label could trigger a model.

**What needs deciding**:
- How many labeled tenders should be required before the model's scores replace the neutral fallback?
- Should there be a model confidence indicator in the UI (based on label count and cross-validation MAE)?

**Why it matters**: A model trained on 5 labels is noise. Showing those scores as if they're meaningful could mislead users into over-trusting the ranking.

---

### 2. What's the right pipeline trigger for user-initiated operations?

**Current state**: Retraining, backfill, and analysis are triggered by dispatching GitHub Actions workflows from the web app. This is brittle (token expiry, silent failures, cold-start latency).

**Options**:
- A. Keep GitHub Actions, add better error reporting and retry
- B. Postgres-backed job queue with a small always-on worker
- C. Managed task queue service (Inngest, Trigger.dev, etc.)

**Context**: The Submit-triggered retrain (see R3) is a relatively infrequent, latency-tolerant operation. Automated analysis triggering (see R1) may be more time-sensitive if users expect results quickly after a tender enters the inbox.

**Suggested approach**: Decide this before building the training loop.

---

### 3. How will historical data be imported for new projects?

**Current state**: There are two historical import scripts in the prototype. They're functional but weren't designed as a first-class workflow. The intent is to redesign this.

**What needs deciding**:
- What is the source of historical PLACSP data? (Monthly ZIPs going back N years? PLACSP's search API? A one-time dump?)
- How far back should historical data go? (Training on 2-year-old tenders may be less useful than 6-month-old ones.)
- Is historical import a one-time setup step per deployment, or can new projects trigger their own historical backfill?
- What about historical bids from the client (the CSV import)? Is that still needed, or was it a workaround?

**Why it matters**: The ML model is useless without training data. Historical import is a prerequisite for any new project to generate useful scores quickly.

---

### 4. Per-project template configuration: how granular?

**Context**: The extraction template has 262 items. Each project needs to configure, per item: auto-fill value, go/no-go rule, or red flag condition. Most items will have no project-specific configuration (just "extract and show").

**What needs deciding**:
- What's the data model for per-project item configuration? (A sparse config table keyed on project_id + item_id is likely the right approach.)
- Is the go/no-go logic simple (threshold comparison) or rule-based (conditional expressions)?
- Who configures this — the operator only, or can client users configure it too?
- Does the template version matter? If the template gains or loses items, what happens to existing project configurations?

**Why it matters**: This drives the schema for project configuration and the UI for the operator setup flow.

---

### 5. What are the TypeScript type issues hidden by `ignoreBuildErrors`?

**What to do**: Before discarding the prototype, run `tsc --noEmit` to understand the scope of type errors. This takes 5 minutes and could save significant time in the rewrite if it reveals architectural issues rather than just stale types.

**Why it matters**: Deep type errors suggest wrong abstractions. Surface type errors (stale Supabase types) are a known and easily fixable issue.

---

### 6. What's the testing strategy?

**Current state**: No tests exist.

**Recommended minimum for the rewrite**:
- Unit tests for hard filter logic (high business impact if wrong, easy to test)
- Tests for RLS policies (use Supabase's local dev environment)
- Integration tests for the capture pipeline (recordable against PLACSP responses)
- Tests for the extraction template parsing (the AI output will need to be validated against expected item structure)

---

### 7. Is the `training_session` migration RPC the right implementation?

**Current state**: When filters change, a Postgres RPC drops invalid training labels atomically. It works, but the logic is invisible to application code and not tested.

**Open question**: Move this logic to application code (more testable, more traceable) or keep it in the database (atomic, no round-trips)?

**Low urgency** — the current approach is correct. Decide consciously rather than copying it by default.
