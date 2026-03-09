from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


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
