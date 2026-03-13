"""Process pending tender_analysis records using document fetching + Claude API.

For each pending record:
  1. Mark status as 'running'.
  2. Fetch the tender's PLACSP page and download attached documents.
  3. Call the LLM to extract structured summaries.
  4. Write results back to tender_analysis (status='done') or mark as 'error'.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


def process_pending_analyses(
    supabase_url: str,
    supabase_key: str,
    anthropic_api_key: str,
    limit: int = 10,
) -> int:
    """Process up to *limit* pending analysis records.

    Returns the number of records successfully completed.
    """
    from supabase import create_client

    from pipeline.analysis.document_fetcher import DocumentFetcher
    from pipeline.analysis.llm_client import LLMAnalyzer

    client = create_client(supabase_url, supabase_key)
    fetcher = DocumentFetcher()
    analyzer = LLMAnalyzer(anthropic_api_key)

    pending_resp = (
        client.table("tender_analysis")
        .select("id, tender_id, project_id")
        .eq("status", "pending")
        .order("triggered_at")
        .limit(limit)
        .execute()
    )
    pending = pending_resp.data or []

    if not pending:
        logger.info("No pending analyses found.")
        return 0

    logger.info("Processing %d pending analysis record(s).", len(pending))
    completed = 0

    for record in pending:
        analysis_id: int = record["id"]
        tender_id: int = record["tender_id"]

        # Mark running
        client.table("tender_analysis").update(
            {"status": "running"}
        ).eq("id", analysis_id).execute()

        try:
            completed += _process_one(
                client=client,
                fetcher=fetcher,
                analyzer=analyzer,
                analysis_id=analysis_id,
                tender_id=tender_id,
            )
        except Exception as exc:
            logger.error(
                "Analysis %d (tender %d) failed: %s",
                analysis_id, tender_id, exc, exc_info=True,
            )
            _mark_error(client, analysis_id, str(exc))

    logger.info("Done. %d/%d analyses completed successfully.", completed, len(pending))
    return completed


# ─── helpers ──────────────────────────────────────────────────────────────────

def _process_one(
    *,
    client,
    fetcher: "DocumentFetcher",
    analyzer: "LLMAnalyzer",
    analysis_id: int,
    tender_id: int,
) -> int:
    """Analyse a single tender and update the DB record. Returns 1 on success."""
    from pipeline.analysis.document_fetcher import DocumentFetcher
    from pipeline.analysis.llm_client import LLMAnalyzer

    # Fetch tender row
    tender_resp = (
        client.table("tenders_raw")
        .select("id, title, summary, link")
        .eq("id", tender_id)
        .single()
        .execute()
    )
    tender = tender_resp.data
    if not tender:
        raise ValueError(f"Tender {tender_id} not found in tenders_raw")

    # Fetch documents (best-effort; fall back to summary-only analysis)
    attached_files: list[dict] = []
    documents_text = ""
    try:
        attached_files, documents_text = fetcher.fetch_texts(tender["link"])
        attached_files = [
            {"name": d["name"], "url": d["url"], "type": d["type"]}
            for d in attached_files
        ]
    except Exception as exc:
        logger.warning(
            "Document fetching failed for tender %d (%s): %s — will analyse summary only.",
            tender_id, tender.get("link"), exc,
        )

    # Call the LLM
    result = analyzer.analyze(
        title=tender["title"],
        summary=tender["summary"],
        link=tender["link"],
        documents_text=documents_text,
    )

    # Persist results
    client.table("tender_analysis").update({
        "status": "done",
        "services_required": result.services_required,
        "technical_conditions": result.technical_conditions,
        "administrative_conditions": result.administrative_conditions,
        "key_data_summary": result.key_data_summary,
        "attached_files": attached_files or None,
        "raw_llm_output": result.raw_llm_output,
        "completed_at": _now_iso(),
    }).eq("id", analysis_id).execute()

    logger.info("Analysis %d completed for tender %d.", analysis_id, tender_id)
    return 1


def _mark_error(client, analysis_id: int, error_message: str) -> None:
    client.table("tender_analysis").update({
        "status": "error",
        "raw_llm_output": {"error": error_message},
        "completed_at": _now_iso(),
    }).eq("id", analysis_id).execute()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
