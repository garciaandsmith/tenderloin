from __future__ import annotations

import io
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pipeline.capture.state_store_supabase import SupabaseStateStore
from pipeline.ingestion.parser import parse_zip_bytes
from pipeline.ingestion.storage_supabase import IngestionStorageSupabase

logger = logging.getLogger(__name__)

_STATE_KEY = "ingestion.last_successful_run_at"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
}


@dataclass(slots=True)
class IngestionRunResult:
    url: str
    fetched: int           # raw entry count from XML before dedup
    deduplicated: int      # unique tenders after within-batch dedup
    upserted: int          # rows written to DB (new or updated)
    skipped: int           # rows already up-to-date in DB
    last_run_at: Optional[datetime]
    new_last_run_at: datetime


class IngestionService:
    """Orchestrates one ingestion run: download → parse → deduplicate → upsert."""

    def __init__(
        self,
        storage: IngestionStorageSupabase,
        state_store: SupabaseStateStore,
        timeout_seconds: int = 120,
        retry_attempts: int = 3,
        retry_backoff_seconds: float = 2.0,
        overlap_minutes: int = 120,
        source: str = "placsp",
    ) -> None:
        self.storage = storage
        self.state_store = state_store
        self.timeout_seconds = timeout_seconds
        self.retry_attempts = retry_attempts
        self.retry_backoff_seconds = retry_backoff_seconds
        self.overlap_minutes = overlap_minutes
        self.source = source

    def run_url(self, url: str, since: Optional[datetime] = None) -> IngestionRunResult:
        """Download a ZIP from url, parse it, and upsert into tenders_ingested."""
        last_run_at = self.state_store.get_last_run_at(key=_STATE_KEY)

        effective_since = since
        if effective_since is None and last_run_at is not None:
            effective_since = last_run_at - timedelta(minutes=max(self.overlap_minutes, 0))

        logger.info(
            "Ingestion run: url=%s last_run_at=%s effective_since=%s",
            url,
            last_run_at,
            effective_since,
        )

        zip_bytes = self._download(url)

        # parse_zip_bytes handles per-ZIP deduplication and optional since filter
        tenders = parse_zip_bytes(zip_bytes, source=self.source, since=effective_since)
        deduplicated = len(tenders)

        upserted, skipped = self.storage.upsert_many(tenders)

        new_last_run_at = datetime.now(timezone.utc)
        self.state_store.set_last_run_at(new_last_run_at, key=_STATE_KEY)

        logger.info(
            "Ingestion complete: deduplicated=%d upserted=%d skipped=%d",
            deduplicated,
            upserted,
            skipped,
        )

        return IngestionRunResult(
            url=url,
            fetched=deduplicated,  # after dedup (ZIP-level raw count not tracked separately)
            deduplicated=deduplicated,
            upserted=upserted,
            skipped=skipped,
            last_run_at=last_run_at,
            new_last_run_at=new_last_run_at,
        )

    def _download(self, url: str) -> bytes:
        last_error: Exception | None = None
        for attempt in range(1, self.retry_attempts + 1):
            try:
                request = Request(url, headers=_HEADERS)
                with urlopen(request, timeout=self.timeout_seconds) as resp:  # noqa: S310
                    raw = resp.read()
                # Detect HTML error pages returned with 200 OK
                preview = raw[:200].decode("utf-8", errors="replace").lstrip()
                if preview.lower().startswith(("<!doc", "<html")):
                    snippet = " ".join(preview.split())[:200]
                    raise RuntimeError(
                        f"Server returned HTML instead of ZIP for {url}. Preview: {snippet!r}"
                    )
                return raw
            except (HTTPError, URLError, TimeoutError, RuntimeError) as exc:
                last_error = exc
                logger.warning(
                    "Download attempt %d/%d failed for %s: %s",
                    attempt,
                    self.retry_attempts,
                    url,
                    exc,
                )
                if attempt < self.retry_attempts:
                    time.sleep(self.retry_backoff_seconds * attempt)

        if last_error is not None:
            raise last_error
        raise RuntimeError("Download failed with no recorded exception")
