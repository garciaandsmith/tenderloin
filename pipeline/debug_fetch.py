"""Standalone diagnostic for document fetching.

Usage:
    python -m pipeline.debug_fetch <tender_url> [technical|administrative]

Example:
    python -m pipeline.debug_fetch \
        'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=3ak%2BDWCiV1TpxJFXpLZ%2B2A%3D%3D' \
        administrative
"""
import sys
import logging
from pipeline.analysis.document_fetcher import (
    DocumentFetcher, _fetch_url, _parse_xml_doc_urls, _download_doc_text
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    url = sys.argv[1]
    analysis_type = sys.argv[2] if len(sys.argv) > 2 else "administrative"

    fetcher = DocumentFetcher()

    # Step 1: tender page → XML link
    print(f"\n[1] Fetching tender page: {url}")
    xml_url = fetcher.fetch_pliego_xml_url(url)
    if not xml_url:
        print("    FAIL: No Pliego XML link found on the tender page.")
        print("    → The page may not have an 'Anuncios y Documentos' section,")
        print("      or the 'Pliego' row / XML link is missing.")
        sys.exit(1)
    print(f"    OK: XML URL = {xml_url}")

    # Step 2: fetch the XML
    print(f"\n[2] Fetching XML: {xml_url}")
    try:
        xml_text = _fetch_url(xml_url)
        print(f"    OK: {len(xml_text)} chars received")
    except Exception as exc:
        print(f"    FAIL: {exc}")
        sys.exit(1)

    # Step 3: parse document URLs from XML
    print(f"\n[3] Parsing XML for {analysis_type} document URLs")
    doc_urls = _parse_xml_doc_urls(xml_text, analysis_type)
    if not doc_urls:
        tag = "TechnicalDocumentReference" if analysis_type == "technical" else "LegalDocumentReference"
        print(f"    FAIL: No <{tag}> elements found in the XML.")
        print(f"    → This tender may not publish a {analysis_type} pliego document.")
        print(f"\n    First 2000 chars of XML for inspection:")
        print("    " + xml_text[:2000].replace("\n", "\n    "))
        sys.exit(1)
    for u in doc_urls:
        print(f"    OK: {u}")

    # Step 4: download and extract text
    print(f"\n[4] Downloading and extracting document text")
    for doc_url in doc_urls:
        print(f"    → {doc_url}")
        text = _download_doc_text(doc_url)
        if text:
            print(f"    OK: {len(text)} chars extracted")
            print(f"    Preview: {text[:300]!r}")
        else:
            print("    FAIL: Downloaded but could not extract any text.")
            print("    → The document may be a scanned/image PDF (no selectable text).")

if __name__ == "__main__":
    main()
