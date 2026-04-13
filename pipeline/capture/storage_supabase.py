from __future__ import annotations

from datetime import datetime
from typing import Iterable

from pipeline.capture.models import TenderRaw


class SupabaseRawTenderRepository:
    """Store raw capture output in Supabase PostgreSQL.

    Implements the same interface as RawTenderRepository so CaptureService
    requires no changes when switching backends.
    """

    def __init__(self, supabase_url: str, service_role_key: str) -> None:
        from supabase import create_client  # lazy import — keeps SQLite path dependency-free

        self._client = create_client(supabase_url, service_role_key)

    def upsert_many(self, tenders: Iterable[TenderRaw], captured_at: datetime, *, force_update: bool = False) -> int:
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
                "cpv": t.cpv,
                "budget_amount": t.budget_amount,
                "source": t.source,
                "created_at": captured_at.isoformat(),
                "contract_type": t.contract_type,
                "procedure_type": t.procedure_type,
                "lot_count": t.lot_count,
                "duration_months": t.duration_months,
                "buyer_type": t.buyer_type,
                "status": t.status,
                "cpv_codes": t.cpv_codes,
            }
            for t in tenders
        ]
        if not rows:
            return 0

        # Batch insert in chunks of 500 to stay within Supabase request limits.
        inserted = 0
        for i in range(0, len(rows), 500):
            chunk = rows[i : i + 500]
            response = (
                self._client.table("tenders_raw")
                .upsert(chunk, on_conflict="external_id,source", ignore_duplicates=not force_update)
                .execute()
            )
            inserted += len(response.data) if response.data else 0
        return inserted
