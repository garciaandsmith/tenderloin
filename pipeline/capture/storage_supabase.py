from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Iterable

from pipeline.capture.models import TenderRaw
from pipeline.enrichment.enrich import _translate_region, _translate_cpv_codes
from pipeline.enrichment.codes import load_cpv_labels

_DEFAULT_CPV_DATA = Path(__file__).parent.parent.parent / "public" / "cpv-data.json"


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
            chunk = rows[i : i + 500]
            response = (
                self._client.table("tenders_raw")
                .upsert(chunk, on_conflict="external_id,source", ignore_duplicates=False)
                .execute()
            )
            upserted += len(response.data) if response.data else 0
        return upserted
