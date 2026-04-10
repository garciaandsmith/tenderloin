"""Supabase storage for the standalone ingestion pipeline.

Upsert strategy: on conflict (external_id, source), update the row only if
the incoming version_at is strictly newer than what is already stored.  This
is enforced at the application layer: before inserting we query the existing
version_at values in bulk and discard rows that would not upgrade the stored
version.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Iterable, List

from pipeline.ingestion.models import TenderIngested

logger = logging.getLogger(__name__)

_TABLE = "tenders_ingested"
_CHUNK_SIZE = 500


def _chunks(lst: list, size: int):
    for i in range(0, len(lst), size):
        yield lst[i : i + size]


class IngestionStorageSupabase:
    def __init__(self, supabase_url: str, service_role_key: str) -> None:
        from supabase import create_client  # lazy import

        self._client = create_client(supabase_url, service_role_key)

    def upsert_many(self, tenders: Iterable[TenderIngested]) -> tuple[int, int]:
        """Upsert tenders with version-guarded conflict resolution.

        Returns (upserted, skipped) counts.
        upserted = rows written (new or updated because version was newer).
        skipped  = rows ignored because the stored version was already newer/equal.
        """
        rows = list(tenders)
        if not rows:
            return 0, 0

        # Fetch existing version_at values for the external_ids in this batch.
        # We do this in chunks to stay within URL-length limits.
        external_ids = [r.external_id for r in rows]
        existing_versions: dict[str, datetime] = {}

        for chunk_ids in _chunks(external_ids, _CHUNK_SIZE):
            try:
                response = (
                    self._client.table(_TABLE)
                    .select("external_id, version_at")
                    .in_("external_id", chunk_ids)
                    .execute()
                )
                if response.data:
                    for item in response.data:
                        try:
                            existing_versions[item["external_id"]] = datetime.fromisoformat(
                                item["version_at"]
                            )
                        except (KeyError, ValueError):
                            pass
            except Exception as exc:
                logger.warning("Could not fetch existing versions (will upsert all): %s", exc)

        # Partition: only upsert rows that are newer than what is stored
        to_write: List[TenderIngested] = []
        skipped = 0
        for t in rows:
            existing = existing_versions.get(t.external_id)
            if existing is None or t.version_at > existing:
                to_write.append(t)
            else:
                skipped += 1

        if not to_write:
            logger.info("All %d rows already up-to-date, skipped.", skipped)
            return 0, skipped

        # Serialise to dicts
        dicts = [
            {
                "external_id": t.external_id,
                "source": t.source,
                "version_at": t.version_at.isoformat(),
                "title": t.title,
                "summary": t.summary,
                "link": t.link,
                "published_at": t.published_at.isoformat() if t.published_at else None,
                "deadline_at": t.deadline_at.isoformat() if t.deadline_at else None,
                "buyer_name": t.buyer_name,
                "region": t.region,
                "cpv": t.cpv,
                "budget_amount": t.budget_amount,
                "contract_type": t.contract_type,
                "procedure_type": t.procedure_type,
                "buyer_type": t.buyer_type,
                "lot_count": t.lot_count,
                "duration_months": t.duration_months,
                "status": t.status,
                "ingested_at": datetime.utcnow().isoformat() + "Z",
            }
            for t in to_write
        ]

        written = 0
        for chunk in _chunks(dicts, _CHUNK_SIZE):
            try:
                response = (
                    self._client.table(_TABLE)
                    .upsert(chunk, on_conflict="external_id,source")
                    .execute()
                )
                written += len(response.data) if response.data else len(chunk)
            except Exception as exc:
                logger.error("Upsert chunk failed: %s", exc)

        logger.info(
            "Upsert complete: written=%d skipped=%d",
            written,
            skipped,
        )
        return written, skipped
