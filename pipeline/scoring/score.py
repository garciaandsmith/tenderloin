"""Score unscored tenders using a pre-trained model artifact."""
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
    """Score tenders in ``tenders_raw`` that have no entry in ``tender_model_scores``
    for the current model version, across all active projects.

    Scores are clamped to [1.0, 5.0] because 0 means "ambiguous / manual review".

    Returns the total number of rows written to ``tender_model_scores``.
    """
    from supabase import create_client
    from sentence_transformers import SentenceTransformer

    from pipeline.scoring.model_io import load_latest_model

    artifact = load_latest_model(models_dir)
    model_version: str = artifact["version"]
    embedder_name: str = artifact["embedder_name"]
    regressor = artifact["regressor"]

    logger.info("Loaded model version %s (MAE=%.3f)", model_version, artifact.get("mae", float("nan")))

    client = create_client(supabase_url, supabase_key)

    # Discover all active projects automatically — no manual configuration needed.
    projects_resp = client.table("projects").select("id").eq("is_active", True).execute()
    project_ids = [row["id"] for row in (projects_resp.data or [])]
    if not project_ids:
        logger.info("No active projects found. Nothing to score.")
        return 0
    logger.info("Scoring for %d active project(s): %s", len(project_ids), project_ids)

    embedder = SentenceTransformer(embedder_name)
    total_written = 0

    for project_id in project_ids:
        # Find tender_ids already scored for this project + model version
        already_resp = (
            client.table("tender_model_scores")
            .select("tender_id")
            .eq("project_id", project_id)
            .eq("model_version", model_version)
            .execute()
        )
        already_scored = {row["tender_id"] for row in (already_resp.data or [])}
        logger.info("[%s] Already scored: %d tenders", project_id, len(already_scored))

        offset = 0
        project_written = 0

        while True:
            resp = (
                client.table("tenders_raw")
                .select("id, title, summary")
                .range(offset, offset + batch_size - 1)
                .execute()
            )
            rows = resp.data or []
            if not rows:
                break

            to_score = [r for r in rows if r["id"] not in already_scored]
            if to_score:
                texts = [
                    f"{r.get('title', '')}. {r.get('summary', '')}".strip(". ")
                    for r in to_score
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
                    for r, s in zip(to_score, raw_scores)
                ]
                client.table("tender_model_scores").upsert(
                    upsert_rows,
                    on_conflict="tender_id,project_id,model_version",
                ).execute()
                project_written += len(upsert_rows)

            if len(rows) < batch_size:
                break
            offset += batch_size

        logger.info("[%s] Scored %d new tenders", project_id, project_written)
        total_written += project_written

    logger.info("Scoring complete. Total written across all projects: %d", total_written)
    return total_written
