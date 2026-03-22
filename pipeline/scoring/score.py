"""Score active tenders using each project's own trained model.

For each active project:
  1. Load the project's model artifact from ``models_dir``.
  2. Find tenders that passed the project's hard filters (from
     ``tender_filter_results``) not yet scored by this project + model version.
  3. Encode and write scores to ``tender_model_scores``.

Projects without a model artifact are skipped with a warning.
The filter step must run before the score step so ``tender_filter_results``
is populated.
"""
from __future__ import annotations

import datetime
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def score_unscored_tenders(
    supabase_url: str,
    supabase_key: str,
    models_dir: Path,
    batch_size: int = 200,
    project_id: str | None = None,
) -> int:
    """Score active tenders for one or all active projects.

    If *project_id* is given only that project is processed; otherwise
    all active projects are processed.

    Scores are clamped to [1.0, 5.0] because 0 means "ambiguous / manual review".
    Returns the total number of rows written to ``tender_model_scores``.
    """
    from supabase import create_client
    from sentence_transformers import SentenceTransformer

    from pipeline.scoring.model_io import load_latest_model

    client = create_client(supabase_url, supabase_key)

    if project_id:
        project_ids = [project_id]
        logger.info("Scoring for project: %s", project_id)
    else:
        projects_resp = client.table("projects").select("id").eq("is_active", True).execute()
        project_ids = [row["id"] for row in (projects_resp.data or [])]
        if not project_ids:
            logger.info("No active projects found. Nothing to score.")
            return 0
        logger.info("Scoring for %d active project(s): %s", len(project_ids), project_ids)

    _page_size = 1000
    total_written = 0

    for proj_id in project_ids:
        # Load project-specific model
        try:
            artifact = load_latest_model(models_dir, proj_id)
        except FileNotFoundError:
            logger.warning(
                "[%s] No model found — skipping. Run run_train.py to create one.",
                proj_id,
            )
            continue

        model_version: str = artifact["version"]
        embedder_name: str = artifact["embedder_name"]
        regressor = artifact["regressor"]
        logger.info(
            "[%s] Loaded model version %s (MAE=%.3f)",
            proj_id, model_version, artifact.get("mae", float("nan")),
        )

        embedder = SentenceTransformer(embedder_name)

        # Tenders that passed this project's hard filters (paginated, per-project).
        filtered_ids: set[int] = set()
        _ff_offset = 0
        while True:
            ff_resp = (
                client.table("tender_filter_results")
                .select("tender_id")
                .eq("project_id", proj_id)
                .eq("passed", True)
                .range(_ff_offset, _ff_offset + _page_size - 1)
                .execute()
            )
            ff_batch = ff_resp.data or []
            for row in ff_batch:
                filtered_ids.add(row["tender_id"])
            if len(ff_batch) < _page_size:
                break
            _ff_offset += _page_size
        logger.info("[%s] Tenders passing filters: %d", proj_id, len(filtered_ids))

        if not filtered_ids:
            logger.info("[%s] No filtered tenders — skipping (run filter step first).", proj_id)
            continue

        # Tenders already scored for this project + model version (paginated).
        already_scored: set[int] = set()
        _as_offset = 0
        while True:
            already_resp = (
                client.table("tender_model_scores")
                .select("tender_id")
                .eq("project_id", proj_id)
                .eq("model_version", model_version)
                .range(_as_offset, _as_offset + _page_size - 1)
                .execute()
            )
            _as_batch = already_resp.data or []
            for row in _as_batch:
                already_scored.add(row["tender_id"])
            if len(_as_batch) < _page_size:
                break
            _as_offset += _page_size
        logger.info("[%s] Already scored: %d tenders", proj_id, len(already_scored))

        to_score_ids = filtered_ids - already_scored

        if not to_score_ids:
            logger.info("[%s] No new tenders to score.", proj_id)
            continue

        logger.info("[%s] Tenders to score: %d", proj_id, len(to_score_ids))

        # Fetch and score in batches — only tenders with a future deadline
        # (outdated tenders remain in filter results for training purposes only).
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        project_written = 0
        ids_list = sorted(to_score_ids)

        for batch_start in range(0, len(ids_list), batch_size):
            batch_ids = ids_list[batch_start : batch_start + batch_size]

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

            texts = [
                f"{r.get('title', '')}. {r.get('summary', '')}".strip(". ")
                for r in rows
            ]
            embeddings = embedder.encode(texts, show_progress_bar=False, batch_size=64)
            raw_scores = regressor.predict(embeddings).tolist()

            upsert_rows = [
                {
                    "tender_id": r["id"],
                    "project_id": proj_id,
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

        logger.info("[%s] Scored %d new tenders", proj_id, project_written)
        total_written += project_written

    logger.info("Scoring complete. Total written across all projects: %d", total_written)
    return total_written
