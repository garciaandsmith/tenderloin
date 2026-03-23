"""Train a scoring model on each project's human labels, then immediately
score all tenders that passed hard filters — all in one pass.

For each active project:
  1. Load human-labeled training data from Supabase (current training session).
  2. If ≥ min_samples: fit Ridge regression on sentence-transformer embeddings.
  3. Score all tenders in tender_filter_results WHERE passed=true.
  4. Upsert results to tender_model_scores.

Projects without enough training data receive a neutral score of 3.0 so they
still appear in the inbox while waiting for more labels.

The filter step must run before this so tender_filter_results is populated.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_EMBEDDER_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
_MODEL_VERSION = "current"


def train_and_score(
    supabase_url: str,
    supabase_key: str,
    min_samples: int = 5,
    batch_size: int = 200,
    project_id: str | None = None,
) -> int:
    """Train and score tenders for one or all active projects.

    Training and scoring happen in the same process with an in-memory model —
    no model files or GitHub Releases involved.

    Returns the total number of rows written to tender_model_scores.
    """
    from supabase import create_client
    from sentence_transformers import SentenceTransformer
    from sklearn.linear_model import Ridge

    from pipeline.scoring.dataset import load_dataset_for_project

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
        logger.info("[%s] Starting train-and-score", proj_id)

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

        # Try to train a model from this project's human labels.
        regressor = None
        embedder = None
        try:
            df = load_dataset_for_project(proj_id, supabase_url, supabase_key)
            if len(df) >= min_samples:
                logger.info("[%s] Training on %d labeled rows…", proj_id, len(df))
                embedder = SentenceTransformer(_EMBEDDER_NAME)
                embs = embedder.encode(
                    df["text"].tolist(), show_progress_bar=False, batch_size=64
                )
                regressor = Ridge(alpha=1.0)
                regressor.fit(embs, df["score"].values.astype(float))
                logger.info("[%s] Model trained.", proj_id)
            else:
                logger.info(
                    "[%s] Only %d rows (need %d) — assigning neutral score 3.0",
                    proj_id, len(df), min_samples,
                )
        except ValueError:
            logger.info("[%s] No training data — assigning neutral score 3.0", proj_id)

        # Score all filtered tenders in batches.
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

            if regressor is not None:
                if embedder is None:
                    embedder = SentenceTransformer(_EMBEDDER_NAME)
                texts = [
                    f"{r.get('title', '')}. {r.get('summary', '')}".strip(". ")
                    for r in rows
                ]
                embeddings = embedder.encode(
                    texts, show_progress_bar=False, batch_size=64
                )
                raw = regressor.predict(embeddings).tolist()
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

        logger.info("[%s] Wrote %d scores.", proj_id, project_written)
        total_written += project_written

    logger.info("Scoring complete. Total written: %d", total_written)
    return total_written
