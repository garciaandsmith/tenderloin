"""Apply per-project hard filters to tenders and persist results.

For each active project, every tender in ``tenders_raw`` is evaluated against
the project's ``project_filters`` configuration.  Results are written to
``tender_filter_results`` (upserted so re-runs are idempotent).

Only tenders that do NOT yet have a filter result for a given project are
processed, so incremental daily runs are cheap.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_filter_pipeline(
    supabase_url: str,
    supabase_key: str,
    batch_size: int = 500,
    project_id: str | None = None,
) -> dict[str, int]:
    """Filter all new tenders for one or every active project.

    If *project_id* is given only that project is processed.
    Returns a dict mapping project_id → number of filter results written.
    """
    from supabase import create_client

    client = create_client(supabase_url, supabase_key)

    if project_id:
        project_ids = [project_id]
        logger.info("Running hard filters for project: %s", project_id)
    else:
        projects_resp = (
            client.table("projects")
            .select("id")
            .eq("is_active", True)
            .execute()
        )
        project_ids = [row["id"] for row in (projects_resp.data or [])]
        if not project_ids:
            logger.info("No active projects found. Nothing to filter.")
            return {}
        logger.info("Running hard filters for %d active project(s)", len(project_ids))

    summary: dict[str, int] = {}
    for project_id in project_ids:
        written = _filter_project(client, project_id, batch_size)
        summary[project_id] = written

    logger.info("Filter pipeline complete: %s", summary)
    return summary


# ---------------------------------------------------------------------------
# Per-project helpers
# ---------------------------------------------------------------------------

def _filter_project(client: Any, project_id: str, batch_size: int) -> int:
    """Apply this project's filters to tenders not yet evaluated.

    Uses the maximum already-evaluated tender ID as a cursor so that only
    new tenders (higher IDs) are fetched — avoids scanning the entire table.
    """

    # Load filter config (may be empty / not yet configured)
    filters_resp = (
        client.table("project_filters")
        .select("*")
        .eq("project_id", project_id)
        .maybe_single()
        .execute()
    )
    filter_cfg: dict = filters_resp.data or {}

    # Find the highest tender_id already evaluated for this project.
    # Since tenders_raw.id is a bigserial, new tenders always have higher IDs,
    # so we only need to evaluate tenders beyond this cursor.
    max_resp = (
        client.table("tender_filter_results")
        .select("tender_id")
        .eq("project_id", project_id)
        .order("tender_id", desc=True)
        .limit(1)
        .execute()
    )
    max_evaluated_id: int = max_resp.data[0]["tender_id"] if max_resp.data else 0
    logger.info("[%s] Max evaluated tender_id: %d", project_id, max_evaluated_id)

    offset = 0
    total_written = 0

    while True:
        resp = (
            client.table("tenders_raw")
            .select(
                "id, title, summary, region, cpv, budget_amount, "
                "contract_type, procedure_type, lot_count, duration_months, buyer_type"
            )
            .gt("id", max_evaluated_id)
            .order("id")
            .range(offset, offset + batch_size - 1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            break

        results = [
            _evaluate_tender(r, filter_cfg, project_id)
            for r in rows
        ]
        client.table("tender_filter_results").upsert(
            results,
            on_conflict="tender_id,project_id",
        ).execute()
        total_written += len(results)

        if len(rows) < batch_size:
            break
        offset += batch_size

    logger.info("[%s] Filter results written: %d", project_id, total_written)
    return total_written


def _evaluate_tender(
    tender: dict,
    cfg: dict,
    project_id: str,
) -> dict:
    """Evaluate a single tender against filter config.

    Returns a ``tender_filter_results`` row dict.
    """
    reasons: list[str] = []

    # Budget range
    budget = tender.get("budget_amount")
    if cfg.get("budget_min") is not None and budget is not None:
        if float(budget) < float(cfg["budget_min"]):
            reasons.append("budget_below_min")
    if cfg.get("budget_max") is not None and budget is not None:
        if float(budget) > float(cfg["budget_max"]):
            reasons.append("budget_above_max")

    # Region (NUTS codes — prefix or exact match)
    if cfg.get("regions"):
        tender_region = (tender.get("region") or "").strip()
        if not any(tender_region.startswith(r) for r in cfg["regions"]):
            reasons.append("region_mismatch")

    # CPV codes (prefix match)
    if cfg.get("cpv_codes"):
        tender_cpv = (tender.get("cpv") or "").strip()
        if not any(tender_cpv.startswith(c) for c in cfg["cpv_codes"]):
            reasons.append("cpv_mismatch")

    # Contract type
    if cfg.get("contract_types"):
        if tender.get("contract_type") not in cfg["contract_types"]:
            reasons.append("contract_type_mismatch")

    # Procedure type
    if cfg.get("procedure_types"):
        if tender.get("procedure_type") not in cfg["procedure_types"]:
            reasons.append("procedure_type_mismatch")

    # Buyer type
    if cfg.get("buyer_types"):
        if tender.get("buyer_type") not in cfg["buyer_types"]:
            reasons.append("buyer_type_mismatch")

    # Lot count
    if cfg.get("max_lot_count") is not None and tender.get("lot_count") is not None:
        if int(tender["lot_count"]) > int(cfg["max_lot_count"]):
            reasons.append("lot_count_exceeded")

    # Contract duration (months)
    duration = tender.get("duration_months")
    if cfg.get("min_contract_months") is not None and duration is not None:
        if int(duration) < int(cfg["min_contract_months"]):
            reasons.append("duration_below_min")
    if cfg.get("max_contract_months") is not None and duration is not None:
        if int(duration) > int(cfg["max_contract_months"]):
            reasons.append("duration_above_max")

    # Keywords (case-insensitive, match against title + summary)
    searchable = (
        f"{tender.get('title', '')} {tender.get('summary', '')}".lower()
    )
    if cfg.get("keywords_include"):
        if not any(kw.lower() in searchable for kw in cfg["keywords_include"]):
            reasons.append("keyword_include_miss")
    if cfg.get("keywords_exclude"):
        if any(kw.lower() in searchable for kw in cfg["keywords_exclude"]):
            reasons.append("keyword_exclude_hit")

    return {
        "tender_id": tender["id"],
        "project_id": project_id,
        "passed": len(reasons) == 0,
        "discard_reasons": reasons if reasons else None,
    }
