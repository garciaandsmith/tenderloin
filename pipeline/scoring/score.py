"""Score filtered tenders using each project's trained model.

For each active project:
  1. Load the project's model artifact from Supabase Storage.
  2. Find tenders that passed the project's hard filters
     (``tender_filter_results`` WHERE passed=true) AND are still active
     (``tenders_raw.deadline_at > now()``).
  3. Skip tenders already scored with the current model version.
  4. Encode and write scores to ``tender_model_scores``.

Projects without a model artifact are scored 3.0 (neutral) so they still
appear in the inbox while waiting for the first retrain to complete.

The filter step must run before this so ``tender_filter_results`` is populated.
Training is a separate concern — see ``pipeline/run_train.py``.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def score_unscored_tenders(
    supabase_url: str,
    supabase_key: str,
    batch_size: int = 200,
    project_id: str | None = None,
) -> int:
    """Score active tenders for one or all active projects.

    Loads each project's model from Supabase Storage and applies it to all
    tenders that passed hard filters AND have a future deadline AND have not
    already been scored with the current model version.  If no model exists
    yet the tenders receive a neutral score of 3.0 so they remain visible in
    the inbox.

    Returns the total number of rows written to ``tender_model_scores``.
    """
    from supabase import create_client
    from sentence_transformers import SentenceTransformer

    from pipeline.scoring.model_io import load_model

    client = create_client(supabase_url, supabase_key)
    now_iso = datetime.now(timezone.utc).isoformat()

    if project_id:
        project_ids = [project_id]
        logger.info("Scoring project: %s", project_id)
    else:
        resp = client.table("projects").select("id").eq("is_active", True).execute()
        project_ids = [r["id"] for r in (resp.data or [])]
        if not project_ids:
            logger.info("No active projects found.")
            return 0
        logger.info("Scoring %d active project(s): %s", len(project_ids), project_ids)

    _page = 1000
    total_written = 0

    for proj_id in project_ids:
        # Load model — None means no model trained yet.
        artifact = load_model(client, proj_id)
        model_version: str = artifact["version"] if artifact else "neutral"

        if artifact:
            logger.info(
                "[%s] Loaded model version=%s (MAE=%.3f)",
                proj_id, model_version, artifact.get("mae", float("nan")),
            )
        else:
            logger.info(
                "[%s] No model yet (version=%s) — tenders will receive neutral score 3.0",
                proj_id, model_version,
            )

        # Collect tenders that passed hard filters (paginated).
        filtered_ids: set[int] = set()
        offset = 0
        while True:
            r = (
                client.table("tender_filter_results")
                .select("tender_id")
                .eq("project_id", proj_id)
                .eq("passed", True)
                .range(offset, offset + _page - 1)
                .execute()
            )
            batch = r.data or []
            for row in batch:
                filtered_ids.add(row["tender_id"])
            if len(batch) < _page:
                break
            offset += _page

        if not filtered_ids:
            logger.info("[%s] No filtered tenders — run filter step first.", proj_id)
            continue

        logger.info("[%s] %d tenders passed filters", proj_id, len(filtered_ids))

        # Skip tenders already scored with this model version.
        already_scored: set[int] = set()
        offset = 0
        while True:
            r = (
                client.table("tender_model_scores")
                .select("tender_id")
                .eq("project_id", proj_id)
                .eq("model_version", model_version)
                .range(offset, offset + _page - 1)
                .execute()
            )
            batch = r.data or []
            for row in batch:
                already_scored.add(row["tender_id"])
            if len(batch) < _page:
                break
            offset += _page

        to_score_ids = sorted(filtered_ids - already_scored)
        if not to_score_ids:
            logger.info(
                "[%s] All filtered tenders already scored with version=%s — nothing to do.",
                proj_id, model_version,
            )
            continue

        logger.info(
            "[%s] %d tenders to score (skipping %d already scored with version=%s)",
            proj_id, len(to_score_ids), len(already_scored), model_version,
        )

        # Initialise embedder once per project if we have a model.
        embedder = None
        if artifact:
            embedder = SentenceTransformer(artifact["embedder_name"])

        # Score in batches, fetching only active tenders (deadline_at > now).
        project_written = 0

        for start in range(0, len(to_score_ids), batch_size):
            batch_ids = to_score_ids[start : start + batch_size]
            resp = (
                client.table("tenders_raw")
                .select("id, title, summary")
                .in_("id", batch_ids)
                .gt("deadline_at", now_iso)
                .execute()
            )
            rows = resp.data or []
            if not rows:
                continue

            if artifact and embedder:
                texts = [
                    f"{r.get('title', '')}. {r.get('summary', '')}".strip(". ")
                    for r in rows
                ]
                embeddings = embedder.encode(texts, show_progress_bar=False, batch_size=64)
                raw = artifact["regressor"].predict(embeddings).tolist()
                scores = [max(1.0, min(5.0, float(s))) for s in raw]
            else:
                scores = [3.0] * len(rows)

            client.table("tender_model_scores").upsert(
                [
                    {
                        "tender_id": r["id"],
                        "project_id": proj_id,
                        "model_score": s,
                        "model_version": model_version,
                    }
                    for r, s in zip(rows, scores)
                ],
                on_conflict="tender_id,project_id,model_version",
            ).execute()
            project_written += len(rows)

        logger.info("[%s] Scored %d active tenders.", proj_id, project_written)
        total_written += project_written

    logger.info("Scoring complete. Total written: %d", total_written)
    return total_written
