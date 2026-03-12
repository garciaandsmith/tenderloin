"""Score filter-passing tenders using each project's own trained model.

For each active project:
  1. Load the project's model artifact from ``models_dir``.
  2. Find tenders that passed the project's hard filters
     (``tender_filter_results.passed = true``).
  3. Skip tenders already scored by this project + model version.
  4. Encode remaining tenders and write scores to ``tender_model_scores``.

Projects without a model artifact are skipped with a warning.
"""
from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def score_unscored_tenders(
    supabase_url: str,
    supabase_key: str,
    models_dir: Path,
    batch_size: int = 200,
) -> int:
    """Score filter-passing tenders for all active projects.

    Scores are clamped to [1.0, 5.0] because 0 means "ambiguous / manual review".

    Returns the total number of rows written to ``tender_model_scores``.
    """
    from supabase import create_client
    from sentence_transformers import SentenceTransformer

    from pipeline.scoring.model_io import load_latest_model

    client = create_client(supabase_url, supabase_key)

    projects_resp = client.table("projects").select("id").eq("is_active", True).execute()
    project_ids = [row["id"] for row in (projects_resp.data or [])]
    if not project_ids:
        logger.info("No active projects found. Nothing to score.")
        return 0
    logger.info("Scoring for %d active project(s): %s", len(project_ids), project_ids)

    total_written = 0

    for project_id in project_ids:
        # Load project-specific model
        try:
            artifact = load_latest_model(models_dir, project_id)
        except FileNotFoundError:
            logger.warning(
                "[%s] No model found — skipping. Run run_train.py to create one.",
                project_id,
            )
            continue

        model_version: str = artifact["version"]
        embedder_name: str = artifact["embedder_name"]
        regressor = artifact["regressor"]
        logger.info(
            "[%s] Loaded model version %s (MAE=%.3f)",
            project_id, model_version, artifact.get("mae", float("nan")),
        )

        embedder = SentenceTransformer(embedder_name)

        # Tenders already scored for this project + model version
        already_resp = (
            client.table("tender_model_scores")
            .select("tender_id")
            .eq("project_id", project_id)
            .eq("model_version", model_version)
            .execute()
        )
        already_scored = {row["tender_id"] for row in (already_resp.data or [])}
        logger.info("[%s] Already scored: %d tenders", project_id, len(already_scored))

        # Tenders that passed this project's hard filters
        filter_resp = (
            client.table("tender_filter_results")
            .select("tender_id")
            .eq("project_id", project_id)
            .eq("passed", True)
            .execute()
        )
        passed_ids = {row["tender_id"] for row in (filter_resp.data or [])}
        to_score_ids = passed_ids - already_scored

        if not to_score_ids:
            logger.info("[%s] No new filter-passing tenders to score.", project_id)
            continue

        logger.info("[%s] Tenders to score: %d", project_id, len(to_score_ids))

        # Fetch and score in batches
        project_written = 0
        ids_list = sorted(to_score_ids)

        for batch_start in range(0, len(ids_list), batch_size):
            batch_ids = ids_list[batch_start : batch_start + batch_size]

            resp = (
                client.table("tenders_raw")
                .select("id, title, summary")
                .in_("id", batch_ids)
                .execute()
            )
            rows = resp.data or []
            if not rows:
                continue

            texts = [
                f"{r.get('title', '')}. {r.get('summary', '')}".strip(". ")
                for r in rows
            ]
            embeddings = embedder.encode(texts, show_progress_bar=False, batch_size=64)
            raw_scores = regressor.predict(embeddings).tolist()

            upsert_rows = [
                {
                    "tender_id": r["id"],
                    "project_id": project_id,
                    "model_score": max(1.0, min(5.0, float(s))),
                    "model_version": model_version,
                }
                for r, s in zip(rows, raw_scores)
            ]
            client.table("tender_model_scores").upsert(
                upsert_rows,
                on_conflict="tender_id,project_id,model_version",
            ).execute()
            project_written += len(upsert_rows)

        logger.info("[%s] Scored %d new tenders", project_id, project_written)
        total_written += project_written

    logger.info("Scoring complete. Total written across all projects: %d", total_written)
    return total_written
