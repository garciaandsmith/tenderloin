"""Bulk-ingest historical PLACSP monthly ZIP files.

Downloads every monthly open-data archive for a given date range and upserts
all tenders into the database.  Duplicates are silently skipped thanks to the
unique constraint on (external_id, source), so re-running is safe.

Usage (local, SQLite):
    python -m pipeline.run_ingest_historical --from-year 2022 --from-month 1

Usage (production, Supabase):
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
        python -m pipeline.run_ingest_historical --from-year 2022 --from-month 1
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
import logging
import os
from pathlib import Path
import time

from pipeline.capture.placsp_client import PlacspClient, PlacspClientConfig

_PLACSP_BASE = (
    "https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643"
)

logger = logging.getLogger(__name__)


def _monthly_zip_url(year: int, month: int) -> str:
    return f"{_PLACSP_BASE}/licitacionesPerfilesContratanteCompleto3_{year}{month:02d}.zip"


def _iter_months(from_year: int, from_month: int, to_year: int, to_month: int):
    """Yield (year, month) tuples for every month in [from, to] inclusive."""
    y, m = from_year, from_month
    while (y, m) <= (to_year, to_month):
        yield y, m
        m += 1
        if m > 12:
            m = 1
            y += 1


def parse_args() -> argparse.Namespace:
    today = date.today()
    parser = argparse.ArgumentParser(
        description=(
            "Bulk-ingest historical PLACSP monthly ZIPs for a date range. "
            "All tenders in each archive are upserted; duplicates are skipped."
        )
    )
    parser.add_argument(
        "--from-year",
        type=int,
        default=2022,
        help="Start year (inclusive). Default: 2022",
    )
    parser.add_argument(
        "--from-month",
        type=int,
        default=1,
        help="Start month 1-12 (inclusive). Default: 1",
    )
    parser.add_argument(
        "--to-year",
        type=int,
        default=today.year,
        help="End year (inclusive). Default: current year",
    )
    parser.add_argument(
        "--to-month",
        type=int,
        default=today.month,
        help="End month 1-12 (inclusive). Default: current month",
    )
    parser.add_argument(
        "--db-path",
        default="data/runtime/tenderloin.db",
        help="SQLite database path (used when SUPABASE_URL env var is not set)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=120,
        help="HTTP timeout per ZIP download in seconds. Default: 120",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=2.0,
        help="Seconds to wait between ZIP downloads to be polite to PLACSP. Default: 2.0",
    )
    parser.add_argument("--log-level", default="INFO", help="Log level")
    return parser.parse_args()


def _build_repository(args: argparse.Namespace):
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if supabase_url and supabase_key:
        logger.info("Using Supabase backend")
        from pipeline.capture.storage_supabase import SupabaseRawTenderRepository

        return SupabaseRawTenderRepository(supabase_url, supabase_key)

    logger.info("Using SQLite backend at %s", args.db_path)
    from pipeline.capture.storage import RawTenderRepository

    return RawTenderRepository(db_path=Path(args.db_path))


def main() -> None:
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

    months = list(_iter_months(args.from_year, args.from_month, args.to_year, args.to_month))
    if not months:
        logger.error("Date range is empty — check --from-year/month and --to-year/month.")
        return

    logger.info(
        "Historical ingest: %d months from %04d-%02d to %04d-%02d",
        len(months),
        args.from_year,
        args.from_month,
        args.to_year,
        args.to_month,
    )

    repository = _build_repository(args)
    total_fetched = 0
    total_inserted = 0
    failed_months: list[str] = []

    for i, (year, month) in enumerate(months):
        label = f"{year}-{month:02d}"
        url = _monthly_zip_url(year, month)

        client = PlacspClient(
            PlacspClientConfig(
                source_url=url,
                timeout_seconds=args.timeout,
                source_name="placsp",
                retry_attempts=3,
                retry_backoff_seconds=2.0,
            )
        )

        try:
            logger.info("[%d/%d] Downloading %s …", i + 1, len(months), label)
            # Pass since=None so no date filtering is applied — we want every tender in the ZIP.
            tenders = client.fetch_since(since=None)
            captured_at = datetime.now(timezone.utc)
            inserted = repository.upsert_many(tenders, captured_at)
            logger.info(
                "[%d/%d] %s — fetched=%d inserted=%d",
                i + 1,
                len(months),
                label,
                len(tenders),
                inserted,
            )
            total_fetched += len(tenders)
            total_inserted += inserted
        except Exception as exc:
            logger.error("[%d/%d] %s FAILED: %s", i + 1, len(months), label, exc)
            failed_months.append(label)

        # Be polite: wait between requests (skip delay after the last month)
        if i < len(months) - 1 and args.delay > 0:
            time.sleep(args.delay)

    logger.info(
        "Historical ingest complete. months_attempted=%d months_failed=%d "
        "total_fetched=%d total_inserted=%d",
        len(months),
        len(failed_months),
        total_fetched,
        total_inserted,
    )

    if failed_months:
        logger.warning("Failed months (can be retried individually): %s", failed_months)

    print(
        "ingest_historical_result",
        {
            "months_attempted": len(months),
            "months_failed": len(failed_months),
            "failed_months": failed_months,
            "total_fetched": total_fetched,
            "total_inserted": total_inserted,
        },
    )


if __name__ == "__main__":
    main()
