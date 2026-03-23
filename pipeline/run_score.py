"""CLI entry point: train scoring models and score filtered tenders.

For each active project:
  1. Load human-labeled training data from Supabase.
  2. If ≥ min_samples rows: fit a Ridge model in memory.
  3. Score all tenders that passed hard filters.
  4. Upsert results to tender_model_scores.

The filter step (run_filter.py) must run before this so
tender_filter_results is populated.

Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.
"""
from __future__ import annotations

import argparse
import logging
import os


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train scoring models and score filtered tenders"
    )
    parser.add_argument(
        "--min-samples",
        type=int,
        default=5,
        help="Minimum human-labeled rows needed to train a model (default: 5)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=200,
        help="Tenders fetched per Supabase request (default: 200)",
    )
    parser.add_argument(
        "--project-id",
        default=None,
        help="Score only this project UUID (default: all active projects)",
    )
    parser.add_argument("--log-level", default="INFO")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not supabase_key:
        raise SystemExit(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required."
        )

    from pipeline.scoring.score import train_and_score

    total = train_and_score(
        supabase_url=supabase_url,
        supabase_key=supabase_key,
        min_samples=args.min_samples,
        batch_size=args.batch_size,
        project_id=args.project_id or None,
    )
    print(f"score_result: {{scored: {total}}}")


if __name__ == "__main__":
    main()
