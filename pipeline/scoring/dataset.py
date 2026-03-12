"""Build a training dataset for a specific project.

The dataset combines two sources:
1. A shared historical CSV (``csv_path``) with columns ``Objeto`` → text and
   ``Score`` → score.  This acts as a universal baseline so that new projects
   with few human labels still produce a reasonable initial model.
2. Human scores stored in Supabase for *this project only* (``project_id``).
   Only scores from the project's current ``training_session`` are included,
   so that a score-reset (which increments the session counter) is immediately
   reflected without having to delete rows.

Rows with ``score == 0`` are excluded because 0 means "manual review needed".
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import pandas as pd


def load_dataset_for_project(
    project_id: str,
    csv_path: Path,
    supabase_url: Optional[str] = None,
    supabase_key: Optional[str] = None,
) -> pd.DataFrame:
    """Return a DataFrame with columns ``text`` and ``score`` (float) for
    the given ``project_id``.

    Raises ``ValueError`` if no usable training rows are found.
    """
    frames: list[pd.DataFrame] = []

    # --- Shared historical CSV baseline ---
    if csv_path.exists():
        df_csv = pd.read_csv(csv_path)
        df_csv = df_csv.rename(columns={"Objeto": "text", "Score": "score"})
        df_csv = df_csv[["text", "score"]].dropna()
        df_csv["score"] = pd.to_numeric(df_csv["score"], errors="coerce")
        df_csv = df_csv.dropna(subset=["score"])
        df_csv = df_csv[df_csv["score"] != 0]
        if not df_csv.empty:
            frames.append(df_csv)

    # --- Project-specific human scores from Supabase ---
    if supabase_url and supabase_key:
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
            "Check the CSV path and Supabase credentials."
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


# ---------------------------------------------------------------------------
# Legacy helper kept for backwards-compat (used by tests / migration scripts)
# ---------------------------------------------------------------------------

def load_dataset(
    csv_path: Path,
    supabase_url: Optional[str] = None,
    supabase_key: Optional[str] = None,
) -> pd.DataFrame:
    """Load the shared historical CSV (plus all-project Supabase scores).

    .. deprecated::
        Prefer ``load_dataset_for_project`` for training per-project models.
        This function merges scores across all projects and should only be used
        for one-off analysis or migration tasks.
    """
    frames: list[pd.DataFrame] = []

    df_csv = pd.read_csv(csv_path)
    df_csv = df_csv.rename(columns={"Objeto": "text", "Score": "score"})
    df_csv = df_csv[["text", "score"]].dropna()
    df_csv["score"] = pd.to_numeric(df_csv["score"], errors="coerce")
    df_csv = df_csv.dropna(subset=["score"])
    df_csv = df_csv[df_csv["score"] != 0]
    frames.append(df_csv)

    if supabase_url and supabase_key:
        try:
            from supabase import create_client

            client = create_client(supabase_url, supabase_key)

            projects_resp = client.table("projects").select("id, training_session").execute()
            projects = projects_resp.data or []

            records = []
            for proj in projects:
                project_id = proj["id"]
                session = proj.get("training_session", 1)

                response = (
                    client.table("tender_scores")
                    .select("score, tenders_raw(title, summary)")
                    .eq("project_id", project_id)
                    .eq("training_session", session)
                    .neq("score", 0)
                    .execute()
                )
                for row in (response.data or []):
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
            logging.getLogger(__name__).warning("Could not load Supabase scores: %s", exc)

    if not frames:
        raise ValueError("No training data found. Check the CSV path and Supabase credentials.")

    result = pd.concat(frames, ignore_index=True)
    result["score"] = result["score"].astype(float)
    result["text"] = result["text"].astype(str)
    if result.empty:
        raise ValueError("No training data found after filtering. Check the CSV path and Supabase credentials.")
    return result
