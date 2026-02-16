from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import json
import logging
from pathlib import Path
from typing import List, Optional
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import urlopen
from xml.etree import ElementTree as ET

from app.capture.models import TenderRaw

ATOM_NS = {"atom": "http://www.w3.org/2005/Atom"}
logger = logging.getLogger(__name__)


@dataclass(slots=True)
class PlacspClientConfig:
    source_url: str
    timeout_seconds: int = 30
    source_name: str = "placsp"


class PlacspClient:
    """Fetch PLACSP tenders from an Atom feed or JSON file URL for local tests."""

    def __init__(self, config: PlacspClientConfig) -> None:
        self.config = config

    def fetch_since(self, since: Optional[datetime]) -> List[TenderRaw]:
        payload = self._download_payload(since)
        if payload.lstrip().startswith("{") or payload.lstrip().startswith("["):
            return self._parse_json(payload)
        return self._parse_atom(payload)

    def _download_payload(self, since: Optional[datetime]) -> str:
        url = self.config.source_url
        if since and url.startswith("http"):
            query = urlencode({"from": since.isoformat()})
            url = f"{url}{'&' if '?' in url else '?'}{query}"

        if url.startswith("file://"):
            return Path(url.removeprefix("file://")).read_text(encoding="utf-8")

        try:
            with urlopen(url, timeout=self.config.timeout_seconds) as response:  # noqa: S310
                return response.read().decode("utf-8", errors="replace")
        except URLError as exc:
            logger.error("Failed to download PLACSP payload: %s", exc)
            raise

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
            tenders.append(
                TenderRaw(
                    external_id=external_id or link or title,
                    title=title,
                    summary=summary,
                    link=link,
                    published_at=published_at,
                    deadline_at=None,
                    buyer_name="",
                    region="",
                    cpv="",
                    budget_amount=None,
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
