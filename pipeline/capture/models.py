from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional


@dataclass(slots=True)
class TenderRaw:
    """Canonical raw tender record captured from PLACSP."""

    external_id: str
    title: str
    summary: str
    link: str
    published_at: datetime
    deadline_at: Optional[datetime]
    buyer_name: str
    region: str
    cpv: str
    budget_amount: Optional[float]
    source: str = "placsp"
    contract_type: Optional[str] = None
    procedure_type: Optional[str] = None
    lot_count: Optional[int] = None
    duration_months: Optional[int] = None
    buyer_type: Optional[str] = None
    status: Optional[str] = None
    cpv_codes: List[str] = field(default_factory=list)
