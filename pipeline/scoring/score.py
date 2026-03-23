"""Score filtered tenders using each project's trained model.

For each active project:
  1. Load the project's model artifact from Supabase Storage.
  2. Find tenders that passed the project's hard filters
     (``tender_filter_results`` WHERE passed=true).
  3. Encode and write scores to ``tender_model_scores``.

Projects without a model artifact are scored 3.0 (neutral) so they still
appear in the inbox while waiting for the first retrain to complete.

The filter step must run before this so ``tender_filter_results`` is populated.
Training is a separate concern — see ``pipeline/run_train.py``.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_MODEL_VERSION = "current"


def score_unscored_tenders(
    supabase_url: str,
    supabase_key: str,
    batch_size: int = 200,
    project_id: str | None = None,
) -> int:
    """Score active tenders for one or all active projects.

    Loads each project's model from Supabase Storage and applies it to all
    tenders that passed hard filters.  If no model exists yet the tenders
    receive a neutral score of 3.0 so they remain visible in the inbox.

    Returns the total number of rows written to ``tender_model_scores``.
    """
    from supabase import create_client
    from sentence_transformers import SentenceTransformer

    from pipeline.scoring.model_io import load_model

    client = create_client(supabase_url, supabase_key)

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
        if artifact:
            logger.info(
                "[%s] Loaded model version=%s (MAE=%.3f)",
                proj_id, artifact["version"], artifact.get("mae", float("nan")),
            )
        else:
            logger.info("[%s] No model yet — tenders will receive neutral score 3.0", proj_id)

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

        # Initialise embedder once per project if we have a model.
        embedder = None
        if artifact:
            embedder = SentenceTransformer(artifact["embedder_name"])

        # Score in batches.
        ids_list = sorted(filtered_ids)
        project_written = 0

        for start in range(0, len(ids_list), batch_size):
            batch_ids = ids_list[start : start + batch_size]
            resp = (
                client.table("tenders_raw")
                .select("id, title, summary")
                .in_("id", batch_ids)
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
                        "model_version": _MODEL_VERSION,
                    }
                    for r, s in zip(rows, scores)
                ],
                on_conflict="tender_id,project_id,model_version",
            ).execute()
            project_written += len(rows)

        logger.info("[%s] Scored %d tenders.", proj_id, project_written)
        total_written += project_written

    logger.info("Scoring complete. Total written: %d", total_written)
    return total_written
