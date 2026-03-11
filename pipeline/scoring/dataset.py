"""Build a unified training dataset from the historical CSV and Supabase human scores."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import pandas as pd


def load_dataset(
    csv_path: Path,
    supabase_url: Optional[str] = None,
    supabase_key: Optional[str] = None,
) -> pd.DataFrame:
    """Return a DataFrame with columns ``text`` and ``score`` (float).

    Sources:
    1. Historical CSV (``csv_path``): columns ``Objeto`` → text, ``Score`` → score.
    2. Supabase ``tender_scores`` joined with ``tenders_raw`` (if credentials provided).

    Rows with score == 0 are excluded because score 0 means "manual review needed"
    (ambiguous label, per scoring rubric).
    """
    frames: list[pd.DataFrame] = []

    # --- Historical CSV ---
    df_csv = pd.read_csv(csv_path)
    df_csv = df_csv.rename(columns={"Objeto": "text", "Score": "score"})
    df_csv = df_csv[["text", "score"]].dropna()
    df_csv["score"] = pd.to_numeric(df_csv["score"], errors="coerce")
    df_csv = df_csv.dropna(subset=["score"])
    df_csv = df_csv[df_csv["score"] != 0]
    frames.append(df_csv)

    # --- Supabase human feedback ---
    if supabase_url and supabase_key:
        try:
            from supabase import create_client

            client = create_client(supabase_url, supabase_key)
            response = (
                client.table("tender_scores")
                .select("score, tenders_raw(title, summary)")
                .neq("score", 0)
                .execute()
            )
            rows = response.data or []
            if rows:
                records = []
                for row in rows:
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
    return result
