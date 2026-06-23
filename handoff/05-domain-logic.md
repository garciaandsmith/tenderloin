# 05 — Domain Logic

The rules and behaviors of the product, independent of how they're implemented. Read this to understand what the system must do, not how the prototype does it.

---

## The core problem

Communication agencies in Spain want to win public contracts. PLACSP publishes thousands of tenders. Most are irrelevant. The agency needs to know, every day, which new tenders are worth looking at — ranked by how likely they are to win.

Manual searches on PLACSP are slow and miss things. This tool automates the triage.

---

## The operator model

The tool is not self-serve. A professional operator (consultant, account manager) sets it up for each client. The operator:
- Creates the client's project(s)
- Configures the hard filters based on the client's business profile
- Guides the client through the initial training session
- Monitors the system and interprets results

End users (the client's staff) primarily use the inbox and occasionally the training interface. They don't configure filters directly (though the system allows it).

---

## Projects

A project represents one line of business or bidding scope for a client. A single company might have multiple projects if they bid on different types of work. Each project has:
- A set of hard filters (objective criteria)
- A trained ML model (subjective affinity scoring)
- An inbox (tenders that passed filters, sorted by model score)
- A training interface (for labeling historical tenders)
- Member access control (which users can see this project)

---

## Tender lifecycle

```
Published on PLACSP
    ↓
Captured into the system (daily)
    ↓
Hard filter evaluation (per project)
    ├── Failed: stored with discard reasons, not shown in inbox
    └── Passed: eligible for inbox
         ↓
         ML model scoring (per project)
         ↓
         Shown in project inbox, sorted by model score
         ↓
         User reviews: dismisses or investigates
              ↓ (if interesting)
              User requests document retrieval
              ↓ (optional)
              AI analysis of tender documents
```

---

## Hard filters

Hard filters are objective criteria. A tender either passes or it doesn't. If it fails any filter, it's excluded from the project inbox entirely.

Filters are configured per project and include:

- **Budget range**: tender budget must fall within [min, max]. Tenders with unknown budget pass (do not exclude unknown).
- **Regions**: tender region must be one of the specified NUTS codes. Empty = all regions pass.
- **CPV codes (prefix match)**: at least one of the tender's CPV codes must start with one of the configured prefix codes. Empty = all CPV codes pass.
- **Contract types**: tender must be one of the allowed types (works, services, supplies, etc.).
- **Procedure types**: open, negotiated, etc.
- **Buyer types**: central government, local authority, etc.
- **Keywords (include)**: tender title or summary must contain at least one of these keywords.
- **Keywords (exclude)**: tender title or summary must not contain any of these keywords.
- **Lot count**: tender must have no more than N lots.
- **Contract duration**: within a specified month range.

All configured filters must pass (AND logic). Unconfigured filters are ignored.

---

## ML scoring (affinity model)

The model predicts how likely a project is to win (or want to bid on) a given tender, on a 0–5 scale.

It's trained per-project by humans reviewing historical tenders:
1. The user sees a historical tender (one that already closed — past deadline, so there's no urgency).
2. They rate it 0–5 based on how well it fits the project.
3. Enough ratings build a training dataset.
4. The model encodes tender text into a vector (using a multilingual sentence-transformer) and learns which vectors correlate with high/low ratings.

**Before the model is trained** (or if fewer than a minimum number of labels exist), tenders receive a neutral fallback score (3.0).

**The model should be retrained** every time new labels are added. This is fast enough to do automatically.

**Displayed in inbox**: tenders are sorted by model score (descending). This lets the most promising tenders rise to the top regardless of publish date.

---

## Training session and filter changes

Training labels are only valid for the filter configuration they were created under.

If a user trains the model on 300 tenders and then changes the hard filters (e.g., removes a CPV code), some of those 300 tenders no longer match the project's scope. Their labels should be removed from the training dataset.

**The rule**: when filters change, any training label for a tender that now fails the new filters is invalidated. The model is retrained on the remaining valid labels.

This means users should be told, before confirming a filter change, how many training labels will be lost. Filter changes are not trivial.

---

## Inbox behavior

The inbox shows tenders that:
1. Passed the project's hard filters
2. Have status "open" (not yet awarded or cancelled) — *or* status unknown

Tenders are sorted by ML model score (high to low).

Users can:
- **Dismiss** a tender (hide it; it's not worth pursuing)
- **Mark as seen** (implicit when they open the detail view)
- **Request document retrieval** (see all documents attached to the tender)
- **Request AI analysis** (optional, for specific analytical purposes)

Dismissed tenders should not reappear unless the user explicitly un-dismisses. Tenders that were dismissed before a filter change should remain dismissed.

---

## Document retrieval

When a user finds a tender interesting, they need access to all documents PLACSP has for that tender. This includes:
- Technical specifications (pliego técnico)
- Administrative specifications (pliego administrativo)
- Annexes, templates, questionnaires, etc.

The system should retrieve all available documents, not just the ones expected for a specific analysis type. The user decides what to do with them.

---

## AI analysis of tender documents

This is an optional step beyond document retrieval. The current approach uses Claude to analyze the downloaded documents and produce structured summaries (technical requirements, administrative conditions, etc.).

This feature is in flux. The specific two-analysis structure (technical / administrative) may not survive into the rewrite. What matters is:
1. Documents can be downloaded and associated with a tender.
2. Some AI-assisted summarization of those documents is desirable.
3. The exact format and triggers for that summarization are to be redesigned.

---

## Historical data and training bootstrap

The ML model is useless without training data. For a new project, there are no labeled tenders yet.

The solution is to use **historical tenders** (past the deadline) for training. These are tenders that the system already captured, or can import, but that are no longer actionable (deadline passed). Users review these in a dedicated training interface, rating them without time pressure.

This means:
1. The system must have access to historical tenders at project setup time. A bulk import of past PLACSP data is a prerequisite.
2. The training interface shows historical tenders that match the project's hard filters, sorted for efficient labeling (most informative first, or just sorted by publish date).
3. Once the model is trained on historical data, new live tenders are automatically scored.

The import of historical data is a one-time (or periodic) operation that is separate from the daily live capture. The rewrite must treat this as a first-class workflow, not an afterthought.

---

## Roles

**Admin**: sees all projects, all users. Can create projects, assign members, manage users. Runs pipeline operations.

**User**: sees only projects they're a member of. Can use inbox, training, filter configuration, analysis.

The operator is typically an admin. Client users have the user role.
