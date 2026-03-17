"""CLI entry point: score unscored tenders using the latest trained model.

Usage:
    python -m pipeline.run_score

Scores tenders for ALL active projects automatically — no project ID needed.
Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.
A model artifact must exist in the models directory (run 'python -m pipeline.run_train' first,
or let the capture workflow train one automatically on first run).
"""
from __future__ import annotations

import argparse
import logging
import os
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Score unscored tenders using the latest model")
    parser.add_argument(
        "--models-dir",
        default="models",
        help="Directory containing model artifacts",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=200,
        help="Number of tenders to fetch per Supabase request",
    )
    parser.add_argument(
        "--project-id",
        default=None,
        help="Score only this project UUID (default: all active projects)",
    )
    parser.add_argument("--log-level", default="INFO", help="Log level")
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
        models_dir=Path(args.models_dir),
        batch_size=args.batch_size,
        project_id=args.project_id or None,
    )
    print("score_result", {"scored": total})


if __name__ == "__main__":
    main()
