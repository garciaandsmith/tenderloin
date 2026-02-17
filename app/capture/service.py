from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
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
    effective_since: Optional[datetime]


class CaptureService:
    def __init__(
        self,
        client: PlacspClient,
        repository: RawTenderRepository,
        state_store: StateStore,
        overlap_minutes: int = 120,
    ) -> None:
        self.client = client
        self.repository = repository
        self.state_store = state_store
        self.overlap_minutes = overlap_minutes

    def run(self) -> CaptureRunResult:
        previous_run = self.state_store.get_last_run_at()
        effective_since = self._effective_since(previous_run)
        logger.info(
            "Starting capture. last_run_at=%s effective_since=%s overlap_minutes=%s",
            previous_run,
            effective_since,
            self.overlap_minutes,
        )

        tenders = self.client.fetch_since(effective_since)
        captured_at = datetime.now(timezone.utc)
        inserted = self.repository.upsert_many(tenders, captured_at)

        new_last_run = captured_at
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
            effective_since=effective_since,
        )

    def _effective_since(self, previous_run: Optional[datetime]) -> Optional[datetime]:
        if previous_run is None:
            return None
        overlap = timedelta(minutes=max(self.overlap_minutes, 0))
        return previous_run - overlap
