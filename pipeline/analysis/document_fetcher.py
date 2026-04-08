"""Download and extract text from PLACSP tender pliego documents.

Two-step fetch:
  1. Parse the tender's main page HTML to find the XML link for the 'Pliego'
     row in the 'Anuncios y Documentos' table.
  2. Parse that XML (CODICE / UBL format published by PLACSP) and follow either
       - TechnicalDocumentReference  → for 'technical' analysis
       - LegalDocumentReference      → for 'administrative' analysis
     to locate the actual document URLs, then download and extract their text.

This replaces the old keyword-matching approach (_PliegoDocParser) with the
authoritative XML-based approach, and makes each analysis type fetch only its
own document — no cross-contamination.
"""
from __future__ import annotations

import io
import logging
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 60
_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


@dataclass
class PliegoTexts:
    """Extracted texts from the relevant pliego document for an analysis type."""
    ppt_text: str = ""    # Pliego de Prescripciones Técnicas  (populated for 'technical')
    pcap_text: str = ""   # Pliego de Cláusulas Administrativas (populated for 'administrative')
    attached_files: list[dict] = field(default_factory=list)


# ─── HTML parser: find the XML link in "Anuncios y Documentos" ────────────────

class _AnunciosTableParser(HTMLParser):
    """Finds the XML view link for the 'Pliego' row in 'Anuncios y Documentos'.

    The PLACSP tender page contains a section headed "Anuncios y Documentos"
    with a table of publication rows. Each row has a document name cell and a
    set of format-icon links (HTML, XML, PDF, download). This parser locates
    any row whose document name contains "pliego" and returns the href of the
    link whose URL contains "xml" — the CODICE/UBL XML publication.
    """

    def __init__(self, base_url: str) -> None:
        super().__init__()
        self.base_url = base_url
        self.pliego_xml_url: str | None = None

        self._in_anuncios_section = False
        self._in_row = False
        self._in_doc_name_cell = False
        self._current_row_has_pliego = False
        self._current_cell_text = ""
        self._pending_heading = False

    def handle_starttag(self, tag: str, attrs: list[tuple]) -> None:
        attr = dict(attrs)

        if tag in ("h2", "h3", "h4"):
            self._pending_heading = True

        if tag == "tr":
            self._in_row = True
            self._current_row_has_pliego = False

        if tag == "td" and self._in_anuncios_section and self._in_row:
            self._in_doc_name_cell = True
            self._current_cell_text = ""

        if tag == "a" and self._in_anuncios_section and self._in_row:
            href = attr.get("href", "")
            if href and self._current_row_has_pliego and self.pliego_xml_url is None:
                if "xml" in href.lower():
                    self.pliego_xml_url = urljoin(self.base_url, href)

    def handle_data(self, data: str) -> None:
        text = data.strip()

        if self._pending_heading:
            if "anuncios" in text.lower() and "documentos" in text.lower():
                self._in_anuncios_section = True
            self._pending_heading = False

        if self._in_doc_name_cell:
            self._current_cell_text += text

    def handle_endtag(self, tag: str) -> None:
        if tag in ("h2", "h3", "h4"):
            self._pending_heading = False

        if tag == "td" and self._in_doc_name_cell:
            if "pliego" in self._current_cell_text.strip().lower():
                self._current_row_has_pliego = True
            self._in_doc_name_cell = False

        if tag == "tr":
            self._in_row = False
            self._current_row_has_pliego = False


# ─── XML parser: extract document URLs by analysis type ───────────────────────

def _parse_xml_doc_urls(xml_text: str, analysis_type: str) -> list[str]:
    """Parse a CODICE/UBL XML and return document URLs for the given analysis type.

    For 'technical'      → follows TechnicalDocumentReference elements
    For 'administrative' → follows LegalDocumentReference elements

    Uses namespace-agnostic wildcard selectors so that differences in the XML
    namespace declaration do not cause misses.
    """
    tag_name = (
        "TechnicalDocumentReference"
        if analysis_type == "technical"
        else "LegalDocumentReference"
    )

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        logger.warning("XML parse error: %s", exc)
        return []

    urls: list[str] = []
    for ref_el in root.iter():
        # Namespace-agnostic: the local tag name is after the closing '}'
        local = ref_el.tag.split("}")[-1] if "}" in ref_el.tag else ref_el.tag
        if local != tag_name:
            continue
        # Look for a URI child anywhere inside this reference element
        for child in ref_el.iter():
            child_local = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if child_local == "URI" and child.text:
                url = child.text.strip()
                if url and url not in urls:
                    urls.append(url)
                break  # one URI per reference

    if urls:
        logger.info("Found %d %s URL(s) in XML", len(urls), tag_name)
    else:
        logger.warning("No %s elements found in XML", tag_name)
    return urls


# ─── low-level helpers ─────────────────────────────────────────────────────────

def _get_extension(url: str) -> str:
    path = urlparse(url).path
    dot = path.rfind(".")
    if dot == -1:
        return ""
    ext = path[dot:].lower()
    return ext if len(ext) <= 5 else ""


def _fetch_url(url: str) -> str:
    req = Request(url, headers={"User-Agent": "Tenderloin/1.0"})
    with urlopen(req, timeout=_TIMEOUT_SECONDS) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _fetch_bytes(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": "Tenderloin/1.0"})
    with urlopen(req, timeout=_TIMEOUT_SECONDS) as resp:
        return resp.read(_MAX_BYTES)


def _extract_pdf_text(content: bytes) -> str:
    try:
        import pypdf

        reader = pypdf.PdfReader(io.BytesIO(content))
        parts = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                parts.append(text)
        return "\n".join(parts)
    except ImportError:
        logger.debug("pypdf not installed; skipping PDF text extraction")
        return ""
    except Exception as exc:
        logger.warning("PDF extraction failed: %s", exc)
        return ""


def _extract_docx_text(content: bytes) -> str:
    try:
        import docx

        doc = docx.Document(io.BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except ImportError:
        logger.debug("python-docx not installed; skipping DOCX text extraction")
        return ""
    except Exception as exc:
        logger.warning("DOCX extraction failed: %s", exc)
        return ""


def _download_doc_text(url: str) -> str:
    """Download a URL and extract its full text (PDF, DOCX, or plain text)."""
    try:
        content = _fetch_bytes(url)
    except Exception as exc:
        logger.warning("Could not download %s: %s", url, exc)
        return ""
    if content[:4] == b"%PDF":
        return _extract_pdf_text(content)
    ext = _get_extension(url)
    if ext in (".doc", ".docx"):
        return _extract_docx_text(content)
    return content.decode("utf-8", errors="replace")


# ─── main class ───────────────────────────────────────────────────────────────

class DocumentFetcher:
    """Fetches pliego document texts from PLACSP tender pages via XML."""

    def fetch_pliego_xml_url(self, tender_url: str) -> str | None:
        """Return the XML publication URL for the 'Pliego' row on the tender page."""
        try:
            html = _fetch_url(tender_url)
        except (URLError, HTTPError, Exception) as exc:
            logger.warning("Could not fetch tender page %s: %s", tender_url, exc)
            return None

        parser = _AnunciosTableParser(tender_url)
        parser.feed(html)

        if parser.pliego_xml_url:
            logger.info("Found Pliego XML URL: %s", parser.pliego_xml_url)
        else:
            logger.warning("No Pliego XML link found on %s", tender_url)
        return parser.pliego_xml_url

    def fetch_texts(self, tender_url: str, analysis_type: str) -> PliegoTexts:
        """Fetch the pliego document text for the given analysis type.

        Downloads only the document type relevant to *analysis_type*:
          - 'technical'      → TechnicalDocumentReference → ppt_text
          - 'administrative' → LegalDocumentReference     → pcap_text

        Returns a PliegoTexts dataclass. Any step that fails is logged as a
        warning and results in an empty string for that document.
        """
        result = PliegoTexts()

        xml_url = self.fetch_pliego_xml_url(tender_url)
        if not xml_url:
            return result

        try:
            xml_text = _fetch_url(xml_url)
        except Exception as exc:
            logger.warning("Could not fetch Pliego XML %s: %s", xml_url, exc)
            return result

        doc_urls = _parse_xml_doc_urls(xml_text, analysis_type)
        if not doc_urls:
            return result

        is_technical = analysis_type == "technical"
        doc_name = (
            "Pliego de Prescripciones Técnicas"
            if is_technical
            else "Pliego de Cláusulas Administrativas"
        )

        parts: list[str] = []
        for url in doc_urls:
            logger.info("Fetching %s document: %s", analysis_type, url)
            text = _download_doc_text(url)
            if text:
                parts.append(text)
            result.attached_files.append({"name": doc_name, "url": url, "type": "pdf"})

        combined = "\n\n---\n\n".join(parts) if parts else ""
        if combined:
            if is_technical:
                result.ppt_text = combined
            else:
                result.pcap_text = combined
        else:
            logger.warning(
                "No text extracted from %s documents for tender %s",
                analysis_type, tender_url,
            )

        return result
