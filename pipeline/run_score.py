"""CLI entry point: score unscored tenders using the latest trained model.

Usage:
    python -m pipeline.run_score --project-id <UUID>
    python -m pipeline.run_score --project-id <UUID> --models-dir models/

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.
Run 'python -m pipeline.run_train' first to create a model artifact.
"""
from __future__ import annotations

import argparse
import logging
import os
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Score unscored tenders using the latest model")
    parser.add_argument(
        "--project-id",
        required=True,
        help="UUID of the project to score tenders for",
    )
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
        project_id=args.project_id,
        models_dir=Path(args.models_dir),
        batch_size=args.batch_size,
    )
    print("score_result", {"project_id": args.project_id, "scored": total})


if __name__ == "__main__":
    main()
