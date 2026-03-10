from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import io
import json
import logging
import time
from pathlib import Path
from typing import Iterable, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET
import zipfile

from pipeline.capture.models import TenderRaw

ATOM_NS = {"atom": "http://www.w3.org/2005/Atom"}
logger = logging.getLogger(__name__)


@dataclass(slots=True)
class PlacspClientConfig:
    source_url: str
    timeout_seconds: int = 30
    source_name: str = "placsp"
    retry_attempts: int = 3
    retry_backoff_seconds: float = 1.0


class PlacspClient:
    """Fetch PLACSP tenders from a public open-data ZIP, Atom feed, or local JSON/XML file."""

    def __init__(self, config: PlacspClientConfig) -> None:
        self.config = config

    def fetch_since(self, since: Optional[datetime]) -> List[TenderRaw]:
        url = self.config.source_url
        if url.lower().endswith(".zip"):
            return self._fetch_zip(url, since)
        payload = self._download_payload(since)
        if payload.lstrip().startswith("{") or payload.lstrip().startswith("["):
            return self._parse_json(payload)
        return self._parse_atom(payload)

    # ── ZIP (open-data monthly dump) ──────────────────────────────────────────

    def _fetch_zip(self, url: str, since: Optional[datetime]) -> List[TenderRaw]:
        logger.info("Downloading open-data ZIP from %s", url)
        raw = self._download_bytes(url)
        tenders: List[TenderRaw] = []
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            xml_names = sorted(n for n in zf.namelist() if n.lower().endswith((".xml", ".atom")))
            logger.info("ZIP contains %d file(s): %s", len(xml_names), xml_names)
            for name in xml_names:
                xml_text = zf.read(name).decode("utf-8", errors="replace")
                try:
                    tenders.extend(self._parse_atom(xml_text))
                except ET.ParseError as exc:
                    logger.warning("Skipping %s — XML parse error: %s", name, exc)

        if since is not None:
            before = len(tenders)
            tenders = [t for t in tenders if t.published_at >= since]
            logger.info("Filtered %d → %d tenders by since=%s", before, len(tenders), since)

        return tenders

    def _download_bytes(self, url: str) -> bytes:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept": "*/*",
            "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        }
        attempts = max(self.config.retry_attempts, 1)
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                request = Request(url, headers=headers)
                with urlopen(request, timeout=self.config.timeout_seconds) as response:  # noqa: S310
                    return response.read()
            except (HTTPError, URLError, TimeoutError) as exc:
                last_error = exc
                logger.warning("Download attempt %s/%s failed for %s: %s", attempt, attempts, url, exc)
                if attempt < attempts:
                    time.sleep(self.config.retry_backoff_seconds * attempt)
        logger.error("Failed to download %s after %s attempts", url, attempts)
        if last_error is not None:
            raise last_error
        raise RuntimeError("Unknown download error without exception")

    # ── Atom / XML feed ───────────────────────────────────────────────────────

    def _download_payload(self, since: Optional[datetime]) -> str:
        url = self.config.source_url
        if since and url.startswith("http"):
            query = urlencode({"from": since.isoformat()})
            url = f"{url}{'&' if '?' in url else '?'}{query}"

        if url.startswith("file://"):
            return Path(url.removeprefix("file://")).read_text(encoding="utf-8")

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept": "application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        }

        attempts = max(self.config.retry_attempts, 1)
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                request = Request(url, headers=headers)
                with urlopen(request, timeout=self.config.timeout_seconds) as response:  # noqa: S310
                    content_type = response.headers.get("Content-Type", "")
                    body = response.read().decode("utf-8", errors="replace")
                    if "text/html" in content_type or body.lstrip()[:100].lower().startswith("<html"):
                        preview = " ".join(body.split())[:300]
                        raise RuntimeError(
                            f"PLACSP returned HTML instead of XML — likely an access error "
                            f"(certificate not authorised or IP blocked). Preview: {preview!r}"
                        )
                    return body
            except (HTTPError, URLError, TimeoutError) as exc:
                last_error = exc
                logger.warning(
                    "Download attempt %s/%s failed for %s: %s",
                    attempt,
                    attempts,
                    url,
                    exc,
                )
                if attempt < attempts:
                    sleep_seconds = self.config.retry_backoff_seconds * attempt
                    time.sleep(sleep_seconds)

        logger.error("Failed to download PLACSP payload after %s attempts", attempts)
        if last_error is not None:
            raise last_error
        raise RuntimeError("Unknown download error without exception")

    # ── Parsers ───────────────────────────────────────────────────────────────

    def _parse_atom(self, xml_text: str) -> List[TenderRaw]:
        root = ET.fromstring(xml_text)
        tenders: List[TenderRaw] = []

        for entry in root.findall("atom:entry", namespaces=ATOM_NS):
            external_id = _text(entry.find("atom:id", namespaces=ATOM_NS))
            title = _text(entry.find("atom:title", namespaces=ATOM_NS))
            summary = _text(entry.find("atom:summary", namespaces=ATOM_NS))
            published_raw = _text(entry.find("atom:updated", namespaces=ATOM_NS))
            link = ""
            link_node = entry.find("atom:link", namespaces=ATOM_NS)
            if link_node is not None:
                link = link_node.attrib.get("href", "")

            published_at = _parse_datetime(published_raw) or datetime.now(timezone.utc)
            deadline_at = _parse_datetime(
                _find_first_text_by_localname(entry, ["DeadlineDate", "EndDate", "PresentationPeriod"])
            )
            buyer_name = (
                _find_nested_text(entry, "LocatedContractingParty", "Name")
                or _find_first_text_by_localname(entry, ["BuyerProfile", "ContractingParty"])
                or ""
            )
            region = _find_first_text_by_localname(entry, ["CountrySubentityCode", "NUTSCode", "Region", "PlaceExecution"]) or ""
            cpv = _find_first_text_by_localname(entry, ["ItemClassificationCode", "CPV", "CPVCode"]) or ""
            budget_amount = _parse_float(
                _find_first_text_by_localname(entry, ["TotalAmount", "BudgetAmount", "EstimatedOverallContractAmount"])
            )

            tenders.append(
                TenderRaw(
                    external_id=external_id or link or title,
                    title=title,
                    summary=summary,
                    link=link,
                    published_at=published_at,
                    deadline_at=deadline_at,
                    buyer_name=buyer_name,
                    region=region,
                    cpv=cpv,
                    budget_amount=budget_amount,
                    source=self.config.source_name,
                )
            )

        return tenders

    def _parse_json(self, raw_json: str) -> List[TenderRaw]:
        data = json.loads(raw_json)
        items = data if isinstance(data, list) else data.get("items", [])
        tenders: List[TenderRaw] = []
        for item in items:
            published = _parse_datetime(item.get("published_at", "")) or datetime.now(timezone.utc)
            deadline = _parse_datetime(item.get("deadline_at", ""))
            tenders.append(
                TenderRaw(
                    external_id=str(item.get("external_id") or item.get("id") or item.get("link") or published.isoformat()),
                    title=str(item.get("title", "")),
                    summary=str(item.get("summary", "")),
                    link=str(item.get("link", "")),
                    published_at=published,
                    deadline_at=deadline,
                    buyer_name=str(item.get("buyer_name", "")),
                    region=str(item.get("region", "")),
                    cpv=str(item.get("cpv", "")),
                    budget_amount=_parse_float(item.get("budget_amount")),
                    source=self.config.source_name,
                )
            )
        return tenders


def _text(node: Optional[ET.Element]) -> str:
    if node is None or node.text is None:
        return ""
    return node.text.strip()


def _localname(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[1]
    return tag


def _find_nested_text(node: ET.Element, parent_localname: str, child_localname: str) -> str:
    """Find the first element matching parent_localname, then return text of child_localname within it."""
    parent_key = parent_localname.lower()
    child_key = child_localname.lower()
    for element in node.iter():
        if _localname(element.tag).lower() == parent_key:
            for child in element.iter():
                if _localname(child.tag).lower() == child_key:
                    value = _text(child)
                    if value:
                        return value
    return ""


def _find_first_text_by_localname(node: ET.Element, local_names: Iterable[str]) -> str:
    wanted = {name.lower() for name in local_names}
    for element in node.iter():
        if _localname(element.tag).lower() in wanted:
            value = _text(element)
            if value:
                return value
    return ""


def _parse_datetime(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        if value.endswith("Z"):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        return datetime.fromisoformat(value)
    except ValueError:
        pass

    try:
        return parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None


def _parse_float(value: object) -> Optional[float]:
    if value in (None, ""):
        return None

    raw = str(value).strip().replace("€", "").replace(" ", "")
    if "," in raw and "." in raw:
        raw = raw.replace(".", "").replace(",", ".")
    elif "," in raw:
        raw = raw.replace(",", ".")

    try:
        return float(raw)
    except ValueError:
        return None
