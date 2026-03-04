from __future__ import annotations

import argparse
import os
from pathlib import Path
import logging

from app.capture.placsp_client import PlacspClient, PlacspClientConfig
from app.capture.service import CaptureService
from app.capture.state_store import StateStore
from app.capture.storage import RawTenderRepository


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run daily PLACSP capture")
    parser.add_argument(
        "--db-path",
        default="data/runtime/tenderloin.db",
        help="SQLite database path (used when SUPABASE_URL env var is not set)",
    )
    parser.add_argument(
        "--source-url",
        default="https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto.xml",
        help="PLACSP Atom feed URL or file:// path to local JSON/XML payload",
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
        from app.capture.storage_supabase import SupabaseRawTenderRepository
        from app.capture.state_store_supabase import SupabaseStateStore

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

    client = PlacspClient(PlacspClientConfig(source_url=args.source_url, timeout_seconds=args.timeout))
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
