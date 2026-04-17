"""Bulk historical re-capture for tenders_raw.

Downloads every monthly PLACSP open-data ZIP for a given date range,
re-parses every tender with the current (improved) parser, and UPDATEs
existing rows in tenders_raw in-place.

Because the conflict key is (external_id, source) — not id — the row's
primary key never changes.  All downstream FK references (tender_scores,
tender_model_scores, tender_filter_results, tender_analysis) are preserved.

Usage:
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\
        python -m pipeline.run_capture_historical \\
            --start 2024-01 --end 2026-04
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
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
            "Bulk historical re-capture into tenders_raw. "
            "Downloads monthly ZIPs from PLACSP and updates existing rows "
            "in-place, preserving all downstream FK references."
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

    from pipeline.capture.placsp_client import PlacspClient, PlacspClientConfig
    from pipeline.capture.storage_supabase import SupabaseRawTenderRepository

    repository = SupabaseRawTenderRepository(supabase_url, supabase_key)

    from_year, from_month = args.start
    to_year, to_month = args.end
    months = list(_iter_months(from_year, from_month, to_year, to_month))

    if not months:
        logger.error("Date range is empty — check --start and --end.")
        return

    logger.info(
        "Historical re-capture: %d months from %04d-%02d to %04d-%02d",
        len(months),
        from_year,
        from_month,
        to_year,
        to_month,
    )

    total_fetched = 0
    total_updated = 0
    failed_months: list[str] = []

    for i, (year, month) in enumerate(months):
        label = f"{year}-{month:02d}"
        url = _monthly_zip_url(year, month)

        try:
            logger.info("[%d/%d] Downloading %s …", i + 1, len(months), label)
            client = PlacspClient(
                PlacspClientConfig(
                    source_url=url,
                    timeout_seconds=args.timeout,
                )
            )
            # since=None: no date filter — process every tender in the ZIP
            tenders = client.fetch_since(since=None)
            captured_at = datetime.now(timezone.utc)
            updated = repository.upsert_many(tenders, captured_at)

            logger.info(
                "[%d/%d] %s — fetched=%d updated=%d",
                i + 1,
                len(months),
                label,
                len(tenders),
                updated,
            )
            total_fetched += len(tenders)
            total_updated += updated

        except Exception as exc:
            logger.error("[%d/%d] %s FAILED: %s", i + 1, len(months), label, exc)
            failed_months.append(label)

        if i < len(months) - 1 and args.delay > 0:
            time.sleep(args.delay)

    logger.info(
        "Historical re-capture complete. months_attempted=%d months_failed=%d "
        "total_fetched=%d total_updated=%d",
        len(months),
        len(failed_months),
        total_fetched,
        total_updated,
    )

    if failed_months:
        logger.warning("Failed months: %s", failed_months)

    print(
        "capture_historical_result",
        {
            "months_attempted": len(months),
            "months_failed": len(failed_months),
            "failed_months": failed_months,
            "total_fetched": total_fetched,
            "total_updated": total_updated,
        },
    )


if __name__ == "__main__":
    main()
