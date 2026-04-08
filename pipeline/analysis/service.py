"""Process pending tender_analysis records using document fetching + Claude API.

For each pending record:
  1. Mark status as 'running'.
  2. Fetch the tender's PLACSP page and download attached documents.
  3. Call the LLM to extract structured summaries for the record's analysis_type.
  4. Write results back to tender_analysis (status='done') or mark as 'error'.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


def process_pending_analyses(
    supabase_url: str,
    supabase_key: str,
    anthropic_api_key: str,
    limit: int = 10,
    analysis_type: Optional[str] = None,
    project_id: Optional[str] = None,
) -> int:
    """Process up to *limit* pending analysis records.

    If *analysis_type* is given ('technical' or 'administrative'), only records
    of that type are processed.  When omitted both types are processed together.
    If *project_id* is given, only records belonging to that project are processed.

    Returns the number of records successfully completed.
    """
    from supabase import create_client

    from pipeline.analysis.document_fetcher import DocumentFetcher
    from pipeline.analysis.llm_client import LLMAnalyzer

    client = create_client(supabase_url, supabase_key)
    fetcher = DocumentFetcher()
    analyzer = LLMAnalyzer(anthropic_api_key)

    query = (
        client.table("tender_analysis")
        .select("id, tender_id, project_id, analysis_type")
        .eq("status", "pending")
        .order("triggered_at")
        .limit(limit)
    )
    if analysis_type:
        query = query.eq("analysis_type", analysis_type)
    if project_id:
        query = query.eq("project_id", project_id)

    pending_resp = query.execute()
    pending = pending_resp.data or []

    if not pending:
        logger.info("No pending analyses found.")
        return 0

    logger.info("Processing %d pending analysis record(s).", len(pending))
    completed = 0

    for record in pending:
        analysis_id: int = record["id"]
        tender_id: int = record["tender_id"]
        record_type: str = record["analysis_type"]

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
                analysis_type=record_type,
            )
        except Exception as exc:
            logger.error(
                "Analysis %d (tender %d, type %s) failed: %s",
                analysis_id, tender_id, record_type, exc, exc_info=True,
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
    analysis_type: str,
) -> int:
    """Analyse a single tender record and update the DB. Returns 1 on success."""
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
    pliego_texts = None
    attached_files: list[dict] = []
    try:
        pliego_texts = fetcher.fetch_texts(tender["link"])
        attached_files = [
            {"name": d["name"], "url": d["url"], "type": d["type"]}
            for d in pliego_texts.attached_files
        ]
    except Exception as exc:
        logger.warning(
            "Document fetching failed for tender %d (%s): %s — will analyse summary only.",
            tender_id, tender.get("link"), exc,
        )

    # Call the LLM with the appropriate analysis type (retries on transient errors)
    result = _call_with_retry(
        analyzer,
        title=tender["title"],
        summary=tender["summary"],
        link=tender["link"],
        analysis_type=analysis_type,
        ppt_text=pliego_texts.ppt_text if pliego_texts else "",
        pcap_text=pliego_texts.pcap_text if pliego_texts else "",
    )

    # Persist results
    client.table("tender_analysis").update({
        "status": "done",
        "services_required": result.services_required,
        "administrative_conditions": result.administrative_conditions,
        "key_data_summary": result.key_data_summary,
        "attached_files": attached_files or None,
        "raw_llm_output": result.raw_llm_output,
        "completed_at": _now_iso(),
    }).eq("id", analysis_id).execute()

    logger.info(
        "Analysis %d (%s) completed for tender %d.",
        analysis_id, analysis_type, tender_id,
    )
    return 1


def _call_with_retry(analyzer, *, max_attempts: int = 3, **kwargs):
    """Call analyzer.analyze(**kwargs) with exponential-backoff retries."""
    for attempt in range(max_attempts):
        try:
            return analyzer.analyze(**kwargs)
        except Exception as exc:
            if attempt == max_attempts - 1:
                raise
            wait = 2 ** attempt  # 1s, 2s
            logger.warning(
                "LLM call failed (attempt %d/%d): %s — retrying in %ds",
                attempt + 1, max_attempts, exc, wait,
            )
            time.sleep(wait)


def _mark_error(client, analysis_id: int, error_message: str) -> None:
    client.table("tender_analysis").update({
        "status": "error",
        "raw_llm_output": {"error": error_message},
        "completed_at": _now_iso(),
    }).eq("id", analysis_id).execute()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
