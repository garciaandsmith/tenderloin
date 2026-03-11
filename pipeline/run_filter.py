"""CLI entry point: apply per-project hard filters to newly captured tenders.

Usage:
    python -m pipeline.run_filter

Evaluates every tender in ``tenders_raw`` against each active project's
``project_filters`` configuration and writes results to
``tender_filter_results``.  Already-evaluated tender/project pairs are
skipped, so this is safe to re-run.

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.
"""
from __future__ import annotations

import argparse
import logging
import os


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Apply per-project hard filters to newly captured tenders"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
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

    from pipeline.filtering.filter import run_filter_pipeline

    summary = run_filter_pipeline(
        supabase_url=supabase_url,
        supabase_key=supabase_key,
        batch_size=args.batch_size,
    )
    print("filter_result", summary)


if __name__ == "__main__":
    main()
