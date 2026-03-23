"""CLI entry point: score filtered tenders using each project's trained model.

Downloads each project's model from Supabase Storage and applies it to all
tenders that passed hard filters.  Projects without a model yet receive a
neutral score of 3.0 so they still appear in the inbox.

The filter step (run_filter.py) must run before this.
Training is a separate concern — see run_train.py.

Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.
"""
from __future__ import annotations

import argparse
import logging
import os


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Score filtered tenders using each project's trained model"
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

    from pipeline.scoring.score import score_unscored_tenders

    total = score_unscored_tenders(
        supabase_url=supabase_url,
        supabase_key=supabase_key,
        batch_size=args.batch_size,
        project_id=args.project_id or None,
    )
    print(f"score_result: {{scored: {total}}}")


if __name__ == "__main__":
    main()
