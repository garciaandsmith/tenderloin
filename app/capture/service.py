from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import logging
from typing import Optional

from app.capture.placsp_client import PlacspClient
from app.capture.state_store import StateStore
from app.capture.storage import RawTenderRepository

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class CaptureRunResult:
    fetched: int
    inserted: int
    last_run_at: Optional[datetime]
    new_last_run_at: datetime


class CaptureService:
    def __init__(
        self,
        client: PlacspClient,
        repository: RawTenderRepository,
        state_store: StateStore,
    ) -> None:
        self.client = client
        self.repository = repository
        self.state_store = state_store

    def run(self) -> CaptureRunResult:
        previous_run = self.state_store.get_last_run_at()
        logger.info("Starting capture. last_run_at=%s", previous_run)

        tenders = self.client.fetch_since(previous_run)
        captured_at = datetime.now(timezone.utc)
        inserted = self.repository.upsert_many(tenders, captured_at)

        max_published = max((item.published_at for item in tenders), default=captured_at)
        new_last_run = max(max_published, captured_at)
        self.state_store.set_last_run_at(new_last_run)

        logger.info(
            "Capture finished. fetched=%s inserted=%s new_last_run_at=%s",
            len(tenders),
            inserted,
            new_last_run,
        )

        return CaptureRunResult(
            fetched=len(tenders),
            inserted=inserted,
            last_run_at=previous_run,
            new_last_run_at=new_last_run,
        )
