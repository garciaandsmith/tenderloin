"""CLI entry point: translate raw NUTS region codes and CPV codes to human-readable labels.

Usage:
    python -m pipeline.run_enrich

Reads tenders_raw rows where region_label or cpv_label is NULL and writes the
translated labels back.  Already-enriched rows are skipped unless --full-rescan
is passed (useful after adding new code mappings).

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.
"""
from __future__ import annotations

import argparse
import logging
import os


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Translate raw region/CPV codes to human-readable labels"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="Number of tenders to fetch per Supabase request",
    )
    parser.add_argument(
        "--full-rescan",
        action="store_true",
        default=False,
        help="Re-enrich ALL tenders, not just those with NULL labels",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Stop after processing this many tenders (useful for breaking large backfills into runs)",
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

    from pipeline.enrichment.enrich import run_enrichment_pipeline

    summary = run_enrichment_pipeline(
        supabase_url=supabase_url,
        supabase_key=supabase_key,
        batch_size=args.batch_size,
        full_rescan=args.full_rescan,
        limit=args.limit,
    )
    print("enrich_result", summary)


if __name__ == "__main__":
    main()
