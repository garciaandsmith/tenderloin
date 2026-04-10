"""Bulk historical ingestion for the standalone ingestion pipeline.

Downloads every monthly PLACSP open-data ZIP for a given date range and
upserts all tenders into tenders_ingested with version-aware conflict
resolution.  Re-running is safe: rows are only updated when the incoming
version_at is strictly newer than what is stored.

Usage:
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\
        python -m pipeline.run_ingestion_historical \\
            --start 2024-01 --end 2024-12
"""

from __future__ import annotations

import argparse
from datetime import date
import logging
import os
import time

_PLACSP_BASE = (
    "https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643"
)

logger = logging.getLogger(__name__)


def _monthly_zip_url(year: int, month: int) -> str:
    return f"{_PLACSP_BASE}/licitacionesPerfilesContratanteCompleto3_{year}{month:02d}.zip"


def _iter_months(from_year: int, from_month: int, to_year: int, to_month: int):
    y, m = from_year, from_month
    while (y, m) <= (to_year, to_month):
        yield y, m
        m += 1
        if m > 12:
            m = 1
            y += 1


def _parse_month_arg(value: str) -> tuple[int, int]:
    """Parse a YYYY-MM string into (year, month)."""
    try:
        parts = value.strip().split("-")
        if len(parts) != 2:
            raise ValueError
        return int(parts[0]), int(parts[1])
    except ValueError:
        raise argparse.ArgumentTypeError(f"Invalid month format {value!r}. Expected YYYY-MM.")


def parse_args() -> argparse.Namespace:
    today = date.today()
    default_end = f"{today.year}-{today.month:02d}"
    parser = argparse.ArgumentParser(
        description=(
            "Bulk historical ingestion into tenders_ingested. "
            "Downloads monthly ZIPs from PLACSP and upserts with version-aware conflict resolution."
        )
    )
    parser.add_argument(
        "--start",
        type=_parse_month_arg,
        default=(2022, 1),
        metavar="YYYY-MM",
        help="Start month inclusive. Default: 2022-01",
    )
    parser.add_argument(
        "--end",
        type=_parse_month_arg,
        default=_parse_month_arg(default_end),
        metavar="YYYY-MM",
        help=f"End month inclusive. Default: {default_end}",
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
        help="Seconds to wait between ZIP downloads. Default: 2.0",
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

    from pipeline.capture.state_store_supabase import SupabaseStateStore
    from pipeline.ingestion.service import IngestionService
    from pipeline.ingestion.storage_supabase import IngestionStorageSupabase

    storage = IngestionStorageSupabase(supabase_url, supabase_key)
    state_store = SupabaseStateStore(supabase_url, supabase_key)
    service = IngestionService(
        storage=storage,
        state_store=state_store,
        timeout_seconds=args.timeout,
        overlap_minutes=0,  # historical: no overlap needed, load entire months
    )

    from_year, from_month = args.start
    to_year, to_month = args.end
    months = list(_iter_months(from_year, from_month, to_year, to_month))

    if not months:
        logger.error("Date range is empty — check --start and --end.")
        return

    logger.info(
        "Historical ingestion: %d months from %04d-%02d to %04d-%02d",
        len(months),
        from_year,
        from_month,
        to_year,
        to_month,
    )

    total_deduplicated = 0
    total_upserted = 0
    total_skipped = 0
    failed_months: list[str] = []

    for i, (year, month) in enumerate(months):
        label = f"{year}-{month:02d}"
        url = _monthly_zip_url(year, month)

        try:
            logger.info("[%d/%d] Downloading %s …", i + 1, len(months), label)
            # Pass since=None so no date filtering is applied for historical runs
            result = service.run_url(url, since=None)
            logger.info(
                "[%d/%d] %s — deduplicated=%d upserted=%d skipped=%d",
                i + 1,
                len(months),
                label,
                result.deduplicated,
                result.upserted,
                result.skipped,
            )
            total_deduplicated += result.deduplicated
            total_upserted += result.upserted
            total_skipped += result.skipped
        except Exception as exc:
            logger.error("[%d/%d] %s FAILED: %s", i + 1, len(months), label, exc)
            failed_months.append(label)

        if i < len(months) - 1 and args.delay > 0:
            time.sleep(args.delay)

    logger.info(
        "Historical ingestion complete. months_attempted=%d months_failed=%d "
        "total_deduplicated=%d total_upserted=%d total_skipped=%d",
        len(months),
        len(failed_months),
        total_deduplicated,
        total_upserted,
        total_skipped,
    )

    if failed_months:
        logger.warning("Failed months: %s", failed_months)

    print(
        "ingestion_historical_result",
        {
            "months_attempted": len(months),
            "months_failed": len(failed_months),
            "failed_months": failed_months,
            "total_deduplicated": total_deduplicated,
            "total_upserted": total_upserted,
            "total_skipped": total_skipped,
        },
    )


if __name__ == "__main__":
    main()
