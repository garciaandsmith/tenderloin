from __future__ import annotations

import argparse
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
        help="SQLite database path",
    )
    parser.add_argument(
        "--source-url",
        default="https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto.xml",
        help="PLACSP Atom feed URL or file:// path to local JSON/XML payload",
    )
    parser.add_argument("--timeout", type=int, default=30, help="HTTP timeout in seconds")
    parser.add_argument("--log-level", default="INFO", help="Log level")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

    db_path = Path(args.db_path)
    client = PlacspClient(PlacspClientConfig(source_url=args.source_url, timeout_seconds=args.timeout))
    repository = RawTenderRepository(db_path=db_path)
    state_store = StateStore(db_path=db_path)

    result = CaptureService(client=client, repository=repository, state_store=state_store).run()
    print(
        "capture_result",
        {
            "fetched": result.fetched,
            "inserted": result.inserted,
            "previous_last_run_at": result.last_run_at.isoformat() if result.last_run_at else None,
            "new_last_run_at": result.new_last_run_at.isoformat(),
        },
    )


if __name__ == "__main__":
    main()
