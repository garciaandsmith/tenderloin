"""Download and extract text from documents linked on PLACSP tender pages."""
from __future__ import annotations

import io
import logging
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

_DOCUMENT_EXTENSIONS = {".pdf", ".doc", ".docx", ".odt", ".zip"}
_TIMEOUT_SECONDS = 30
_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
_MAX_PAGES = 20  # PDF pages to read
_MAX_DOCS = 5    # documents to fetch per tender


class _LinkExtractor(HTMLParser):
    """Extracts document links from an HTML page."""

    def __init__(self, base_url: str) -> None:
        super().__init__()
        self.base_url = base_url
        self.links: list[dict] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "a":
            return
        attr_dict = dict(attrs)
        href = attr_dict.get("href")
        if not href:
            return

        full_url = urljoin(self.base_url, href)
        ext = _get_extension(full_url)

        is_doc_ext = ext in _DOCUMENT_EXTENSIONS
        is_placsp_doc = any(
            kw in full_url.lower()
            for kw in ("documento", "pliego", "annex", "anexo", "adjunto")
        )

        if is_doc_ext or is_placsp_doc:
            name = (
                attr_dict.get("title")
                or attr_dict.get("data-title")
                or _url_to_name(full_url)
            )
            self.links.append({
                "url": full_url,
                "name": name,
                "type": ext.lstrip(".") if ext else "document",
            })


def _get_extension(url: str) -> str:
    path = urlparse(url).path
    dot = path.rfind(".")
    if dot == -1:
        return ""
    ext = path[dot:].lower()
    return ext if len(ext) <= 5 else ""


def _url_to_name(url: str) -> str:
    path = urlparse(url).path
    return path.rstrip("/").split("/")[-1] or "documento"


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


class DocumentFetcher:
    """Fetches document links and text from PLACSP tender detail pages."""

    def fetch_documents(self, tender_url: str) -> list[dict]:
        """Return a list of {name, url, type} dicts found on the tender page."""
        try:
            html = _fetch_url(tender_url)
        except (URLError, HTTPError, Exception) as exc:
            logger.warning("Could not fetch tender page %s: %s", tender_url, exc)
            return []

        extractor = _LinkExtractor(tender_url)
        extractor.feed(html)

        seen: set[str] = set()
        unique: list[dict] = []
        for doc in extractor.links:
            if doc["url"] not in seen:
                seen.add(doc["url"])
                unique.append(doc)

        logger.info("Found %d document link(s) on %s", len(unique), tender_url)
        return unique

    def extract_text(self, url: str, doc_type: str) -> str:
        """Download *url* and return its plain-text content."""
        try:
            content = _fetch_bytes(url)
        except Exception as exc:
            logger.warning("Could not download %s: %s", url, exc)
            return ""

        if doc_type == "pdf" or content[:4] == b"%PDF":
            return _extract_pdf_text(content)
        if doc_type in ("doc", "docx"):
            return _extract_docx_text(content)
        if doc_type in ("txt",):
            return content.decode("utf-8", errors="replace")
        return ""

    def fetch_texts(self, tender_url: str) -> tuple[list[dict], str]:
        """Fetch document list and concatenated text for the tender.

        Returns (attached_files, combined_text).
        """
        docs = self.fetch_documents(tender_url)
        texts: list[str] = []
        for doc in docs[:_MAX_DOCS]:
            text = self.extract_text(doc["url"], doc["type"])
            if text:
                texts.append(f"=== {doc['name']} ===\n{text[:4000]}")
        return docs, "\n\n".join(texts)
