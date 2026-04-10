"""Improved PLACSP XML parser for the standalone ingestion pipeline.

Key improvements over pipeline/capture/placsp_client.py:

1. Version-aware deduplication: entries are grouped by external_id and only
   the entry with the latest <updated> timestamp is kept.  This correctly
   handles the versioned-stream nature of PLACSP data, where the same tender
   can appear many times in one ZIP.

2. Structured path traversal: fields are extracted by walking explicit chains
   of element localnames (e.g. TenderingProcess → TenderSubmissionDeadlinePeriod
   → EndDate) rather than searching the whole tree.  A flat fallback is still
   applied when the primary path yields nothing, so the parser degrades
   gracefully for older or non-standard entries.

3. Derived fields:
   - deadline_at: from TenderSubmissionDeadlinePeriod/EndDate (not generic EndDate)
   - duration_months: from DurationMeasure[@unitCode=MON] or computed from
     PlannedPeriod StartDate / EndDate difference
   - lot_count: count of ProcurementProjectLot elements
   - status: ContractFolderStatusCode (PUB, ADJ, FOR, EV, AN, …)

4. Reuses all lookup maps and date/float/int helpers from the capture module.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Iterable, List, Optional
from xml.etree import ElementTree as ET

from pipeline.capture.placsp_client import (
    _CONTRACT_TYPE_MAP,
    _PROCEDURE_TYPE_MAP,
    _BUYER_TYPE_MAP,
    _count_by_localname,
    _localname,
    _parse_datetime,
    _parse_float,
    _parse_int,
    _text,
)
from pipeline.ingestion.models import TenderIngested

ATOM_NS = {"atom": "http://www.w3.org/2005/Atom"}
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Path-walking helpers
# ---------------------------------------------------------------------------

def _path(node: ET.Element, *localnames: str) -> Optional[ET.Element]:
    """Walk node → child₁ → child₂ → … by localname.

    Each step searches only direct children, so this never accidentally picks
    up a deeply-nested element that happens to share a name.  Returns None if
    any step fails.
    """
    current: ET.Element = node
    for name in localnames:
        name_lower = name.lower()
        current = next(
            (c for c in current if _localname(c.tag).lower() == name_lower),
            None,
        )
        if current is None:
            return None
    return current


def _path_text(node: ET.Element, *localnames: str) -> Optional[str]:
    el = _path(node, *localnames)
    if el is not None and el.text and el.text.strip():
        return el.text.strip()
    return None


def _find_all_by_localname(node: ET.Element, local_name: str) -> List[ET.Element]:
    """Return every element in the subtree whose localname matches (case-insensitive)."""
    key = local_name.lower()
    return [el for el in node.iter() if _localname(el.tag).lower() == key]


def _find_first_text(node: ET.Element, *local_names: str) -> Optional[str]:
    """Flat tree search: return the first non-empty text matching any of the localnames."""
    wanted = {n.lower() for n in local_names}
    for el in node.iter():
        if _localname(el.tag).lower() in wanted:
            value = _text(el)
            if value:
                return value
    return None


# ---------------------------------------------------------------------------
# Field extractors
# ---------------------------------------------------------------------------

def _extract_status(entry: ET.Element) -> Optional[str]:
    """ContractFolderStatusCode from ContractFolderStatus."""
    # Preferred path
    val = _path_text(entry, "ContractFolderStatus", "ContractFolderStatusCode")
    if val:
        return val
    # Flat fallback
    return _find_first_text(entry, "ContractFolderStatusCode")


def _extract_deadline(entry: ET.Element) -> Optional[datetime]:
    """Deadline from TenderingProcess → TenderSubmissionDeadlinePeriod → EndDate.

    Falls back to a flat search for legacy / non-standard entries.
    """
    # Primary: proper UBL location for submission deadline
    val = _path_text(
        entry,
        "TenderingProcess",
        "TenderSubmissionDeadlinePeriod",
        "EndDate",
    )
    if not val:
        # Also try EndDateTime variant
        val = _path_text(
            entry,
            "TenderingProcess",
            "TenderSubmissionDeadlinePeriod",
            "EndDateTime",
        )
    if not val:
        # Fallback: flat search
        val = _find_first_text(entry, "DeadlineDate", "PresentationPeriod")
    return _parse_datetime(val) if val else None


def _extract_budget(entry: ET.Element) -> Optional[float]:
    """Budget from TenderingTerms → BudgetAmount → TaxExclusiveAmount."""
    val = _path_text(entry, "TenderingTerms", "BudgetAmount", "TaxExclusiveAmount")
    if not val:
        val = _path_text(entry, "TenderingTerms", "BudgetAmount", "TotalAmount")
    if not val:
        val = _find_first_text(
            entry,
            "TaxExclusiveAmount",
            "TotalAmount",
            "BudgetAmount",
            "EstimatedOverallContractAmount",
        )
    return _parse_float(val) if val else None


def _extract_region(entry: ET.Element) -> str:
    """Region from ProcurementProject → RealizedLocation → Address → CountrySubentityCode."""
    val = _path_text(
        entry,
        "ProcurementProject",
        "RealizedLocation",
        "Address",
        "CountrySubentityCode",
    )
    if not val:
        val = _find_first_text(entry, "CountrySubentityCode", "NUTSCode", "Region", "PlaceExecution")
    return val or ""


def _extract_cpv(entry: ET.Element) -> str:
    """CPV from ProcurementProject → RequiredCommodityClassification → ItemClassificationCode."""
    val = _path_text(
        entry,
        "ProcurementProject",
        "RequiredCommodityClassification",
        "ItemClassificationCode",
    )
    if not val:
        val = _find_first_text(entry, "ItemClassificationCode", "CPV", "CPVCode")
    return val or ""


def _extract_contract_type(entry: ET.Element) -> Optional[str]:
    """Contract type code from ProcurementProject → TypeCode."""
    val = _path_text(entry, "ProcurementProject", "TypeCode")
    if not val:
        val = _find_first_text(entry, "ContractTypeCode")
    return _CONTRACT_TYPE_MAP.get(val.strip()) if val else None


def _extract_procedure_type(entry: ET.Element) -> Optional[str]:
    """Procedure type code from TenderingProcess → ProcedureCode."""
    val = _path_text(entry, "TenderingProcess", "ProcedureCode")
    if not val:
        val = _find_first_text(entry, "ProcedureCode")
    return _PROCEDURE_TYPE_MAP.get(val.strip()) if val else None


def _extract_buyer_name(entry: ET.Element) -> str:
    """Buyer name from ContractingParty → Party → PartyName → Name."""
    val = _path_text(entry, "ContractingParty", "Party", "PartyName", "Name")
    if not val:
        # Some entries nest it differently
        val = _path_text(entry, "ContractingParty", "PartyName", "Name")
    if not val:
        val = _path_text(entry, "LocatedContractingParty", "Name")
    if not val:
        val = _find_first_text(entry, "PartyName", "BuyerProfile", "ContractingParty")
    return val or ""


def _extract_buyer_type(entry: ET.Element) -> Optional[str]:
    """Buyer type from ContractingParty → ContractingPartyType → PartyTypeCode."""
    val = _path_text(entry, "ContractingParty", "ContractingPartyType", "PartyTypeCode")
    if not val:
        val = _find_first_text(entry, "ContractingPartyTypeCode", "PartyTypeCode")
    return _BUYER_TYPE_MAP.get(val.strip()) if val else None


def _extract_lot_count(entry: ET.Element) -> Optional[int]:
    count = _count_by_localname(entry, "ProcurementProjectLot")
    return count if count > 0 else None


def _extract_duration(entry: ET.Element) -> Optional[int]:
    """Duration in months.

    Primary: DurationMeasure with unitCode=MON inside ProcurementProject.
    Fallback 1: any DurationMeasure in the entry.
    Fallback 2: compute from PlannedPeriod StartDate / EndDate difference.
    """
    # Search for DurationMeasure elements anywhere in the entry
    for el in _find_all_by_localname(entry, "DurationMeasure"):
        unit = el.attrib.get("unitCode", "").upper()
        if unit in ("MON", "MONTH", ""):
            val = _parse_int(el.text)
            if val is not None:
                return val

    # Also try plain Duration element
    val = _parse_int(_find_first_text(entry, "Duration"))
    if val is not None:
        return val

    # Derive from PlannedPeriod dates
    start_text = _path_text(entry, "ProcurementProject", "PlannedPeriod", "StartDate")
    end_text = _path_text(entry, "ProcurementProject", "PlannedPeriod", "EndDate")
    if start_text and end_text:
        start = _parse_datetime(start_text)
        end = _parse_datetime(end_text)
        if start and end and end > start:
            return max(1, round((end - start).days / 30.44))

    return None


# ---------------------------------------------------------------------------
# Entry parser
# ---------------------------------------------------------------------------

def _parse_entry(entry: ET.Element, source: str) -> Optional[TenderIngested]:
    """Parse one <atom:entry> element into a TenderIngested record.

    Returns None if the entry lacks a usable external_id or version_at.
    """
    # Atom-namespace fields
    external_id = _text(entry.find("atom:id", namespaces=ATOM_NS))
    title = _text(entry.find("atom:title", namespaces=ATOM_NS))
    summary = _text(entry.find("atom:summary", namespaces=ATOM_NS))
    updated_raw = _text(entry.find("atom:updated", namespaces=ATOM_NS))

    link = ""
    link_node = entry.find("atom:link", namespaces=ATOM_NS)
    if link_node is not None:
        link = link_node.attrib.get("href", "")

    if not external_id:
        external_id = link or title
    if not external_id:
        return None

    version_at = _parse_datetime(updated_raw)
    if version_at is None:
        version_at = datetime.now(timezone.utc)

    # published_at: the Atom updated timestamp IS the publication date for PLACSP
    published_at = version_at

    return TenderIngested(
        external_id=external_id,
        source=source,
        version_at=version_at,
        title=title,
        summary=summary,
        link=link,
        published_at=published_at,
        deadline_at=_extract_deadline(entry),
        buyer_name=_extract_buyer_name(entry),
        region=_extract_region(entry),
        cpv=_extract_cpv(entry),
        budget_amount=_extract_budget(entry),
        contract_type=_extract_contract_type(entry),
        procedure_type=_extract_procedure_type(entry),
        buyer_type=_extract_buyer_type(entry),
        lot_count=_extract_lot_count(entry),
        duration_months=_extract_duration(entry),
        status=_extract_status(entry),
    )


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------

def _deduplicate(tenders: List[TenderIngested]) -> List[TenderIngested]:
    """Keep only the most recent version of each external_id within a batch.

    PLACSP ZIPs are a stream of updates: the same tender can appear many times,
    each with a newer <updated> timestamp.  We keep only the latest.
    """
    seen: dict[str, TenderIngested] = {}
    for t in tenders:
        existing = seen.get(t.external_id)
        if existing is None or t.version_at > existing.version_at:
            seen[t.external_id] = t
    return list(seen.values())


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_xml(xml_text: str, source: str = "placsp") -> List[TenderIngested]:
    """Parse an Atom XML string and return one TenderIngested per unique external_id.

    Entries are deduplicated within this call: only the most recently updated
    version of each tender is returned.
    """
    root = ET.fromstring(xml_text)
    raw: List[TenderIngested] = []

    for entry in root.findall("atom:entry", namespaces=ATOM_NS):
        tender = _parse_entry(entry, source)
        if tender is not None:
            raw.append(tender)

    return _deduplicate(raw)


def parse_zip_bytes(
    zip_bytes: bytes,
    source: str = "placsp",
    since: Optional[datetime] = None,
) -> List[TenderIngested]:
    """Parse all XML/Atom files inside a ZIP archive.

    Deduplication is applied across the entire ZIP (not per-file), so the
    latest version of each tender wins regardless of which file it appears in.

    If since is provided, tenders with version_at < since are discarded after
    deduplication.
    """
    import io
    import zipfile

    all_tenders: List[TenderIngested] = []

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        xml_names = sorted(
            n for n in zf.namelist() if n.lower().endswith((".xml", ".atom"))
        )
        logger.info(
            "ZIP contains %d XML/Atom file(s): %s",
            len(xml_names),
            xml_names,
        )
        for name in xml_names:
            xml_text = zf.read(name).decode("utf-8", errors="replace")
            try:
                # Parse without dedup so we accumulate all versions first
                root = ET.fromstring(xml_text)
                for entry in root.findall("atom:entry", namespaces=ATOM_NS):
                    tender = _parse_entry(entry, source)
                    if tender is not None:
                        all_tenders.append(tender)
            except ET.ParseError as exc:
                logger.warning("Skipping %s — XML parse error: %s", name, exc)

    # Single deduplication pass across the whole ZIP
    deduped = _deduplicate(all_tenders)

    if since is not None:
        before = len(deduped)
        deduped = [t for t in deduped if t.version_at >= since]
        logger.info(
            "Filtered %d → %d tenders by since=%s",
            before,
            len(deduped),
            since,
        )

    logger.info(
        "Parsed ZIP: raw_entries=%d after_dedup=%d after_since_filter=%d",
        len(all_tenders),
        len(_deduplicate(all_tenders)),
        len(deduped),
    )
    return deduped
