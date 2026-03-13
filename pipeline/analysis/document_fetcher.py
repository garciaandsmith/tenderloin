"""Download and extract text from PLACSP tender pliego documents.

Two-step fetch:
  1. Parse the tender's main page to find the 'Pliego' HTML view link in the
     'Anuncios y Documentos' table.
  2. Fetch that Pliego HTML page and locate the PDF links for:
       - Pliego de Prescripciones Técnicas (PPT)
       - Pliego de Cláusulas Administrativas (PCAP)
  3. Download and extract text from each PDF separately.
"""
from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 30
_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
_MAX_PAGES = 20  # PDF pages to read


@dataclass
class PliegoTexts:
    """Extracted texts from the two key pliego documents."""
    ppt_text: str = ""    # Pliego de Prescripciones Técnicas
    pcap_text: str = ""   # Pliego de Cláusulas Administrativas
    attached_files: list[dict] = field(default_factory=list)


# ─── HTML parsers ──────────────────────────────────────────────────────────────

class _AnunciosTableParser(HTMLParser):
    """Finds the HTML view link for the 'Pliego' row in 'Anuncios y Documentos'.

    The PLACSP tender page contains a section headed "Anuncios y Documentos"
    with a table of publication rows. Each row has a document name cell and a
    set of format-icon links (HTML, XML, PDF, download). This parser locates
    the 'Pliego' row and returns the href of the first link in its icons cell
    (the HTML format icon).
    """

    def __init__(self, base_url: str) -> None:
        super().__init__()
        self.base_url = base_url
        self.pliego_html_url: str | None = None

        # State flags
        self._in_anuncios_section = False
        self._in_row = False
        self._in_doc_name_cell = False
        self._current_row_has_pliego = False
        self._current_row_link_count = 0
        self._current_cell_text = ""
        self._cell_index = 0  # index of <td> within the current <tr>

    def handle_starttag(self, tag: str, attrs: list[tuple]) -> None:
        attr = dict(attrs)

        # Detect the "Anuncios y Documentos" section by heading text;
        # we set the flag in handle_data instead.
        if tag in ("h2", "h3", "h4"):
            self._pending_heading = True

        if tag == "tr":
            self._in_row = True
            self._current_row_has_pliego = False
            self._current_row_link_count = 0
            self._cell_index = 0

        if tag == "td" and self._in_anuncios_section and self._in_row:
            self._cell_index += 1
            self._in_doc_name_cell = True
            self._current_cell_text = ""

        if tag == "a" and self._in_anuncios_section and self._in_row:
            href = attr.get("href")
            if href and self._current_row_has_pliego and self.pliego_html_url is None:
                # The first link in a Pliego row is the HTML format icon
                self._current_row_link_count += 1
                if self._current_row_link_count == 1:
                    self.pliego_html_url = urljoin(self.base_url, href)

    def handle_data(self, data: str) -> None:
        text = data.strip()

        # Detect section headings
        if hasattr(self, "_pending_heading") and self._pending_heading:
            if "anuncios" in text.lower() and "documentos" in text.lower():
                self._in_anuncios_section = True
            self._pending_heading = False

        if self._in_doc_name_cell:
            self._current_cell_text += text

    def handle_endtag(self, tag: str) -> None:
        if tag in ("h2", "h3", "h4"):
            self._pending_heading = False

        if tag == "td" and self._in_doc_name_cell:
            cell_text = self._current_cell_text.strip().lower()
            if cell_text == "pliego":
                self._current_row_has_pliego = True
            self._in_doc_name_cell = False

        if tag == "tr":
            self._in_row = False
            self._current_row_has_pliego = False
            self._current_row_link_count = 0
            self._cell_index = 0


class _PliegoDocParser(HTMLParser):
    """Finds PPT and PCAP PDF links on the Pliego HTML page.

    Looks for <a href="...pdf"> tags whose visible text or title attribute
    contains keywords identifying each document type.
    """

    _PPT_KEYWORDS = ("prescripciones",)
    _PCAP_KEYWORDS = ("cláusulas", "clausulas")

    def __init__(self, base_url: str) -> None:
        super().__init__()
        self.base_url = base_url
        self.ppt_url: str | None = None
        self.pcap_url: str | None = None

        self._current_href: str | None = None
        self._current_title: str | None = None
        self._current_link_text = ""

    def handle_starttag(self, tag: str, attrs: list[tuple]) -> None:
        if tag != "a":
            return
        attr = dict(attrs)
        href = attr.get("href", "")
        if not href:
            return
        ext = _get_extension(href)
        if ext != ".pdf":
            return
        self._current_href = urljoin(self.base_url, href)
        self._current_title = (attr.get("title") or attr.get("data-title") or "").lower()
        self._current_link_text = ""

    def handle_data(self, data: str) -> None:
        if self._current_href is not None:
            self._current_link_text += data

    def handle_endtag(self, tag: str) -> None:
        if tag != "a" or self._current_href is None:
            return

        combined = (self._current_link_text + " " + (self._current_title or "")).lower()

        if self.ppt_url is None and any(kw in combined for kw in self._PPT_KEYWORDS):
            self.ppt_url = self._current_href
        elif self.pcap_url is None and any(kw in combined for kw in self._PCAP_KEYWORDS):
            self.pcap_url = self._current_href

        self._current_href = None
        self._current_title = None
        self._current_link_text = ""


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
        for page in reader.pages[:_MAX_PAGES]:
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


def _download_pdf_text(url: str) -> str:
    """Download a URL and extract its text (PDF or DOCX)."""
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
    # Treat as plain text
    return content.decode("utf-8", errors="replace")


# ─── main class ───────────────────────────────────────────────────────────────

class DocumentFetcher:
    """Fetches PPT and PCAP document texts from PLACSP tender pages."""

    def fetch_pliego_url(self, tender_url: str) -> str | None:
        """Return the HTML view URL for the 'Pliego' row on the tender page."""
        try:
            html = _fetch_url(tender_url)
        except (URLError, HTTPError, Exception) as exc:
            logger.warning("Could not fetch tender page %s: %s", tender_url, exc)
            return None

        parser = _AnunciosTableParser(tender_url)
        parser.feed(html)

        if parser.pliego_html_url:
            logger.info("Found Pliego HTML URL: %s", parser.pliego_html_url)
        else:
            logger.warning("No Pliego HTML link found on %s", tender_url)
        return parser.pliego_html_url

    def fetch_pliego_pdf_urls(self, pliego_url: str) -> dict[str, str | None]:
        """Return {'ppt': url_or_None, 'pcap': url_or_None} from the Pliego HTML page."""
        try:
            html = _fetch_url(pliego_url)
        except (URLError, HTTPError, Exception) as exc:
            logger.warning("Could not fetch Pliego page %s: %s", pliego_url, exc)
            return {"ppt": None, "pcap": None}

        parser = _PliegoDocParser(pliego_url)
        parser.feed(html)

        logger.info("Pliego PDFs — PPT: %s | PCAP: %s", parser.ppt_url, parser.pcap_url)
        return {"ppt": parser.ppt_url, "pcap": parser.pcap_url}

    def fetch_texts(self, tender_url: str) -> PliegoTexts:
        """Fetch PPT and PCAP texts from the tender's Pliego documents.

        Returns a PliegoTexts dataclass. Any step that fails is logged as a
        warning and results in an empty string for that document.
        """
        result = PliegoTexts()

        pliego_url = self.fetch_pliego_url(tender_url)
        if not pliego_url:
            return result

        pdf_urls = self.fetch_pliego_pdf_urls(pliego_url)

        ppt_url = pdf_urls.get("ppt")
        pcap_url = pdf_urls.get("pcap")

        if ppt_url:
            logger.info("Fetching PPT PDF: %s", ppt_url)
            result.ppt_text = _download_pdf_text(ppt_url)
            result.attached_files.append({
                "name": "Pliego de Prescripciones Técnicas",
                "url": ppt_url,
                "type": "pdf",
            })
        else:
            logger.warning("PPT PDF not found on Pliego page %s", pliego_url)

        if pcap_url:
            logger.info("Fetching PCAP PDF: %s", pcap_url)
            result.pcap_text = _download_pdf_text(pcap_url)
            result.attached_files.append({
                "name": "Pliego de Cláusulas Administrativas",
                "url": pcap_url,
                "type": "pdf",
            })
        else:
            logger.warning("PCAP PDF not found on Pliego page %s", pliego_url)

        return result
