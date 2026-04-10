from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass(slots=True)
class TenderIngested:
    """A single tender record produced by the standalone ingestion pipeline.

    version_at is taken from the XML <updated> element and is the key field
    for conflict resolution: a new row only overwrites an existing one when
    its version_at is strictly newer than what is stored.
    """

    external_id: str
    source: str
    version_at: datetime       # from XML <updated>
    title: str
    summary: str
    link: str
    published_at: Optional[datetime]
    deadline_at: Optional[datetime]
    buyer_name: str
    region: str
    cpv: str
    budget_amount: Optional[float]
    contract_type: Optional[str]
    procedure_type: Optional[str]
    buyer_type: Optional[str]
    lot_count: Optional[int]
    duration_months: Optional[int]
    status: Optional[str]      # ContractFolderStatusCode: PUB, ADJ, FOR, EV, AN, …
