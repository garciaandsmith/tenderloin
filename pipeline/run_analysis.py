"""CLI entry point: process pending tender analysis records.

For each pending record in ``tender_analysis`` the script:
  1. Downloads documents linked from the PLACSP tender page.
  2. Sends the content to the Claude API for structured extraction.
  3. Writes the results back to ``tender_analysis`` (status → done/error).

Usage:
    python -m pipeline.run_analysis
    python -m pipeline.run_analysis --analysis-type technical
    python -m pipeline.run_analysis --analysis-type administrative

Required environment variables:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    ANTHROPIC_API_KEY
"""
from __future__ import annotations

import argparse
import logging
import os


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Process pending tender analysis records")
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Maximum number of pending analyses to process per run (default: 10)",
    )
    parser.add_argument(
        "--analysis-type",
        choices=["technical", "administrative"],
        default=None,
        help="Only process records of this type. Omit to process both types.",
    )
    parser.add_argument("--log-level", default="INFO", help="Logging level (default: INFO)")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")

    missing = [
        name
        for name, val in [
            ("SUPABASE_URL", supabase_url),
            ("SUPABASE_SERVICE_ROLE_KEY", supabase_key),
            ("ANTHROPIC_API_KEY", anthropic_key),
        ]
        if not val
    ]
    if missing:
        raise SystemExit(
            f"Missing required environment variable(s): {', '.join(missing)}"
        )

    from pipeline.analysis.service import process_pending_analyses

    completed = process_pending_analyses(
        supabase_url=supabase_url,
        supabase_key=supabase_key,
        anthropic_api_key=anthropic_key,
        limit=args.limit,
        analysis_type=args.analysis_type,
    )
    print("analysis_result", {"completed": completed})


if __name__ == "__main__":
    main()
