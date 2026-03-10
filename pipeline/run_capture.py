from __future__ import annotations

import argparse
from datetime import date, timedelta
import os
from pathlib import Path
import logging

from pipeline.capture.placsp_client import PlacspClient, PlacspClientConfig

_PLACSP_BASE = (
    "https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643"
)


def _monthly_zip_url(year: int, month: int) -> str:
    return f"{_PLACSP_BASE}/licitacionesPerfilesContratanteCompleto3_{year}{month:02d}.zip"


_today = date.today()
_DEFAULT_SOURCE_URL = _monthly_zip_url(_today.year, _today.month)

# Previous-month fallback: used when the current month's file is not yet published
# (can happen at the very start of a new month).
_first_of_month = _today.replace(day=1)
_prev_month_day = _first_of_month - timedelta(days=1)
_PREV_MONTH_URL = _monthly_zip_url(_prev_month_day.year, _prev_month_day.month)
from pipeline.capture.service import CaptureService
from pipeline.capture.state_store import StateStore
from pipeline.capture.storage import RawTenderRepository


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run daily PLACSP capture")
    parser.add_argument(
        "--db-path",
        default="data/runtime/tenderloin.db",
        help="SQLite database path (used when SUPABASE_URL env var is not set)",
    )
    parser.add_argument(
        "--source-url",
        default=_DEFAULT_SOURCE_URL,
        help=(
            "PLACSP open-data ZIP URL (resumen diario), Atom feed URL, "
            "or file:// path to local JSON/XML payload. "
            "Default: current month's public ZIP from sindicacion_643 "
            "(no registration required)."
        ),
    )
    parser.add_argument("--timeout", type=int, default=30, help="HTTP timeout in seconds")
    parser.add_argument("--log-level", default="INFO", help="Log level")
    parser.add_argument(
        "--overlap-minutes",
        type=int,
        default=120,
        help="Lookback overlap (minutes) to avoid missing delayed publications",
    )
    return parser.parse_args()


def _build_repository_and_state(args: argparse.Namespace):
    """Return (repository, state_store) selecting backend from environment."""
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if supabase_url and supabase_key:
        logging.getLogger(__name__).info("Using Supabase backend")
        from pipeline.capture.storage_supabase import SupabaseRawTenderRepository
        from pipeline.capture.state_store_supabase import SupabaseStateStore

        return (
            SupabaseRawTenderRepository(supabase_url, supabase_key),
            SupabaseStateStore(supabase_url, supabase_key),
        )

    logging.getLogger(__name__).info("Using SQLite backend at %s", args.db_path)
    db_path = Path(args.db_path)
    return RawTenderRepository(db_path=db_path), StateStore(db_path=db_path)


def main() -> None:
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

    # When using the default URL, add previous month as fallback so that captures
    # at the very start of a new month (before PLACSP publishes the current month's
    # file) still succeed by falling back to the previous month's ZIP.
    fallback_urls = [_PREV_MONTH_URL] if args.source_url == _DEFAULT_SOURCE_URL else []
    client = PlacspClient(
        PlacspClientConfig(
            source_url=args.source_url,
            timeout_seconds=args.timeout,
            fallback_urls=fallback_urls,
        )
    )
    repository, state_store = _build_repository_and_state(args)

    result = CaptureService(
        client=client,
        repository=repository,
        state_store=state_store,
        overlap_minutes=args.overlap_minutes,
    ).run()

    print(
        "capture_result",
        {
            "fetched": result.fetched,
            "inserted": result.inserted,
            "previous_last_run_at": result.last_run_at.isoformat() if result.last_run_at else None,
            "effective_since": result.effective_since.isoformat() if result.effective_since else None,
            "new_last_run_at": result.new_last_run_at.isoformat(),
        },
    )


if __name__ == "__main__":
    main()
