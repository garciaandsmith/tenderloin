from __future__ import annotations

from datetime import datetime
import logging
from pathlib import Path
from typing import Iterable

from pipeline.capture.models import TenderRaw
from pipeline.enrichment.enrich import _translate_region, _translate_cpv_codes
from pipeline.enrichment.codes import load_cpv_labels

_DEFAULT_CPV_DATA = Path(__file__).parent.parent.parent / "public" / "cpv-data.json"
logger = logging.getLogger(__name__)


class SupabaseRawTenderRepository:
    """Store raw capture output in Supabase PostgreSQL.

    Implements the same interface as RawTenderRepository so CaptureService
    requires no changes when switching backends.

    Region and CPV labels are computed and written in the same upsert so that
    every row is fully enriched from the moment it lands in the database.
    """

    def __init__(
        self,
        supabase_url: str,
        service_role_key: str,
        cpv_data_path: Path | None = None,
    ) -> None:
        from supabase import create_client  # lazy import — keeps SQLite path dependency-free

        self._client = create_client(supabase_url, service_role_key)
        self._cpv_labels = load_cpv_labels(cpv_data_path or _DEFAULT_CPV_DATA)

    def upsert_many(self, tenders: Iterable[TenderRaw], captured_at: datetime) -> int:
        rows = [
            {
                "external_id": t.external_id,
                "title": t.title,
                "summary": t.summary,
                "link": t.link,
                "published_at": t.published_at.isoformat(),
                "deadline_at": t.deadline_at.isoformat() if t.deadline_at else None,
                "buyer_name": t.buyer_name,
                "region": t.region,
                "budget_amount": t.budget_amount,
                "source": t.source,
                # created_at is intentionally excluded: new rows get the DB column default (now());
                # existing rows are not touched, preserving the original capture timestamp.
                "updated_at": captured_at.isoformat(),
                "contract_type": t.contract_type,
                "procedure_type": t.procedure_type,
                "lot_count": t.lot_count,
                "duration_months": t.duration_months,
                "buyer_type": t.buyer_type,
                "status": t.status,
                "cpv_codes": t.cpv_codes,
                "region_label": _translate_region(t.region),
                "cpv_labels": _translate_cpv_codes(t.cpv_codes, self._cpv_labels),
            }
            for t in tenders
        ]
        if not rows:
            return 0

        # Batch in chunks of 500 to stay within Supabase request limits.
        upserted = 0
        for i in range(0, len(rows), 500):
            upserted += self._upsert_chunk(rows[i : i + 500])
        return upserted

    def _upsert_chunk(self, chunk: list) -> int:
        try:
            response = (
                self._client.table("tenders_raw")
                .upsert(chunk, on_conflict="external_id,source", ignore_duplicates=False)
                .execute()
            )
            return len(response.data) if response.data else 0
        except Exception as exc:
            msg = str(exc)
            # The production DB may still have cpv as NOT NULL (pending drop migration).
            # Retry once with an empty-string sentinel so new-row INSERTs succeed.
            if "cpv" in msg and (
                "23502" in msg or "not-null" in msg.lower() or "null value" in msg.lower()
            ):
                logger.warning(
                    "cpv NOT NULL constraint detected; retrying with legacy cpv='' "
                    "(apply supabase/migrations/20260424_make_cpv_nullable.sql to skip this retry)"
                )
                fallback = [{**row, "cpv": ""} for row in chunk]
                response = (
                    self._client.table("tenders_raw")
                    .upsert(fallback, on_conflict="external_id,source", ignore_duplicates=False)
                    .execute()
                )
                return len(response.data) if response.data else 0
            raise
