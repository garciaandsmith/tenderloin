"""Build a training dataset for a specific project.

Training data comes exclusively from human scores stored in Supabase for
*this project only* (``project_id``).  Only scores from the project's current
``training_session`` are included, so that a score-reset (which increments
the session counter) is immediately reflected without having to delete rows.

Each project builds its own isolated learning from scratch.

Rows with ``score == 0`` are excluded because 0 means "manual review needed".
"""
from __future__ import annotations

from typing import Optional

import pandas as pd


def load_dataset_for_project(
    project_id: str,
    supabase_url: str,
    supabase_key: str,
) -> pd.DataFrame:
    """Return a DataFrame with columns ``text`` and ``score`` (float) for
    the given ``project_id``.

    Loads exclusively from the project's own human-labeled Supabase scores.

    Raises ``ValueError`` if no usable training rows are found.
    """
    frames: list[pd.DataFrame] = []

    try:
        from supabase import create_client

        client = create_client(supabase_url, supabase_key)

        # Get this project's current training session
        proj_resp = (
            client.table("projects")
            .select("training_session")
            .eq("id", project_id)
            .single()
            .execute()
        )
        session = (proj_resp.data or {}).get("training_session", 1)

        scores_resp = (
            client.table("tender_scores")
            .select("score, tenders_raw(title, summary)")
            .eq("project_id", project_id)
            .eq("training_session", session)
            .neq("score", 0)
            .execute()
        )

        records = []
        for row in (scores_resp.data or []):
            tender = row.get("tenders_raw") or {}
            title = tender.get("title", "") or ""
            summary = tender.get("summary", "") or ""
            text = f"{title}. {summary}".strip(". ")
            if text:
                records.append({"text": text, "score": float(row["score"])})

        if records:
            frames.append(pd.DataFrame(records))

    except Exception as exc:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).warning(
            "[%s] Could not load Supabase scores: %s", project_id, exc
        )

    if not frames:
        raise ValueError(
            f"No training data found for project {project_id}. "
            "Check the Supabase credentials and that the project has human scores."
        )

    result = pd.concat(frames, ignore_index=True)
    result["score"] = result["score"].astype(float)
    result["text"] = result["text"].astype(str)
    result = result[result["score"] != 0].dropna(subset=["score", "text"])

    if result.empty:
        raise ValueError(
            f"No training data found for project {project_id} after filtering."
        )
    return result
