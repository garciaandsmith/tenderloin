"""Daily fresh ingestion run for the standalone ingestion pipeline.

Downloads the current month's PLACSP open-data ZIP, parses it with
version-aware deduplication, and upserts into tenders_ingested.

Usage (production, Supabase):
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python -m pipeline.run_ingestion

The previous month is added as a fallback URL so that runs at the very start
of a new month (before PLACSP publishes the current month's file) still succeed.
"""

from __future__ import annotations

import argparse
from datetime import date, timedelta
import logging
import os

_PLACSP_BASE = (
    "https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643"
)


def _monthly_zip_url(year: int, month: int) -> str:
    return f"{_PLACSP_BASE}/licitacionesPerfilesContratanteCompleto3_{year}{month:02d}.zip"


_today = date.today()
_DEFAULT_SOURCE_URL = _monthly_zip_url(_today.year, _today.month)
_prev_day = _today.replace(day=1) - timedelta(days=1)
_PREV_MONTH_URL = _monthly_zip_url(_prev_day.year, _prev_day.month)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run daily PLACSP ingestion (tenders_ingested)")
    parser.add_argument(
        "--source-url",
        default=_DEFAULT_SOURCE_URL,
        help="PLACSP open-data ZIP URL. Default: current month's ZIP.",
    )
    parser.add_argument("--timeout", type=int, default=120, help="HTTP timeout in seconds")
    parser.add_argument("--log-level", default="INFO", help="Log level")
    parser.add_argument(
        "--overlap-minutes",
        type=int,
        default=120,
        help="Lookback overlap in minutes to avoid missing delayed publications",
    )
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
        overlap_minutes=args.overlap_minutes,
    )

    url = args.source_url

    # Try primary URL; fall back to previous month if download fails
    try:
        result = service.run_url(url)
    except Exception as exc:
        if url == _DEFAULT_SOURCE_URL:
            logging.getLogger(__name__).warning(
                "Primary URL failed (%s), retrying with previous month: %s",
                exc,
                _PREV_MONTH_URL,
            )
            result = service.run_url(_PREV_MONTH_URL)
        else:
            raise

    print(
        "ingestion_result",
        {
            "url": result.url,
            "deduplicated": result.deduplicated,
            "upserted": result.upserted,
            "skipped": result.skipped,
            "previous_last_run_at": result.last_run_at.isoformat() if result.last_run_at else None,
            "new_last_run_at": result.new_last_run_at.isoformat(),
        },
    )


if __name__ == "__main__":
    main()
