"""Post-ingestion enrichment: translate raw NUTS and CPV codes to human-readable labels.

Reads tenders_raw rows where region_label IS NULL (or all rows on a full rescan),
translates the region and cpv_codes fields using the NUTS and CPV lookup tables, then
writes the results back to the region_label and cpv_labels columns.

The original region / cpv_codes columns are never modified so that the
filter pipeline's prefix-matching logic continues to work correctly.
"""
from __future__ import annotations

import logging
import re
import time
from collections import defaultdict
from pathlib import Path
from typing import Optional

from pipeline.enrichment.codes import NUTS_LABELS, load_cpv_labels

logger = logging.getLogger(__name__)

# Matches any NUTS code for Spain: "ES" optionally followed by 1-4 alphanumeric chars.
_NUTS_RE = re.compile(r"^ES[0-9A-Z]{0,4}$", re.IGNORECASE)

# Path to cpv-data.json relative to this file's location (repo_root/public/).
_DEFAULT_CPV_DATA = Path(__file__).parent.parent.parent / "public" / "cpv-data.json"

# Max IDs per Supabase `in_` filter call to stay within URL length limits.
_CHUNK_SIZE = 200


def _translate_region(region: str) -> str:
    """Return a human-readable label for a region value.

    - NUTS code (e.g. "ES614") → looks up NUTS_LABELS, returns label or the
      code itself when it isn't in the table (unknown sub-province).
    - Already human-readable text → returned as-is.
    - Empty / missing → returns "" (sentinel meaning "enriched, no data").

    Returning "" instead of None for missing data allows the enrichment pipeline
    to distinguish "not yet enriched" (NULL) from "enriched but no region" ("").
    """
    value = (region or "").strip()
    if not value:
        return ""
    if _NUTS_RE.match(value):
        return NUTS_LABELS.get(value.upper(), value)
    return value


def _translate_cpv_codes(cpv_codes: list[str], cpv_labels: dict[str, str]) -> list[str]:
    """Return human-readable labels for every code in cpv_codes.

    Each element is either the label from the CPV vocabulary or the raw code
    when the code is not in the vocabulary.  Empty codes are skipped.
    """
    result = []
    for code in cpv_codes:
        code = code.strip()
        if not code:
            continue
        label = cpv_labels.get(code)
        result.append(label if label else code)
    return result


_MAX_RETRIES = 3
_RETRY_BACKOFF = 2  # seconds


def _execute_with_retry(build_query_fn, on_connection_error):
    """Execute a Supabase query, retrying on transient connection and server errors."""
    import httpx
    from postgrest.exceptions import APIError

    for attempt in range(_MAX_RETRIES):
        try:
            return build_query_fn().execute()
        except (httpx.RemoteProtocolError, httpx.LocalProtocolError) as exc:
            if attempt == _MAX_RETRIES - 1:
                raise
            wait = _RETRY_BACKOFF * (2 ** attempt)
            logger.warning(
                "Connection error on attempt %d/%d (%s); retrying in %ds with a fresh client",
                attempt + 1, _MAX_RETRIES, exc, wait,
            )
            time.sleep(wait)
            on_connection_error()
        except APIError as exc:
            # Retry on transient gateway/server errors (502, 503, 504).
            if str(getattr(exc, "code", "")) not in ("502", "503", "504") or attempt == _MAX_RETRIES - 1:
                raise
            wait = _RETRY_BACKOFF * (2 ** attempt)
            logger.warning(
                "Server error %s on attempt %d/%d; retrying in %ds",
                getattr(exc, "code", "?"), attempt + 1, _MAX_RETRIES, wait,
            )
            time.sleep(wait)


def run_enrichment_pipeline(
    supabase_url: str,
    supabase_key: str,
    batch_size: int = 500,
    full_rescan: bool = False,
    cpv_data_path: Optional[Path] = None,
    limit: Optional[int] = None,
) -> dict:
    """Translate raw codes in tenders_raw to human-readable label columns.

    Args:
        supabase_url:  Supabase project URL.
        supabase_key:  Service-role key (bypasses RLS).
        batch_size:    Rows fetched per Supabase SELECT request.
        full_rescan:   Re-enrich all rows, not just those with NULL labels.
        cpv_data_path: Override path to cpv-data.json.
        limit:         Stop after processing this many rows (None = no limit).

    Returns:
        Dict with ``processed`` and ``updated`` counts.
    """
    from supabase import create_client

    # Use a list so the closure can rebind the client on connection errors.
    client_ref = [create_client(supabase_url, supabase_key)]
    cpv_labels = load_cpv_labels(cpv_data_path or _DEFAULT_CPV_DATA)

    def refresh_client():
        client_ref[0] = create_client(supabase_url, supabase_key)

    total_processed = 0
    total_updated = 0

    # Build the list of filter passes to run.  Splitting the two conditions into
    # separate sequential passes avoids a combined OR that forces a full-table scan
    # and triggers Supabase's statement timeout (PostgreSQL error 57014).
    if full_rescan:
        # No filter — process every row.
        passes = [None]
    else:
        # Pass 1: rows never enriched (region_label IS NULL).
        # Pass 2: rows enriched before cpv_labels existed (backfill).
        # Each uses a simple equality/IS-NULL filter that can hit an index.
        passes = [
            "region_label.is.null",
            "cpv_codes.neq.{},cpv_labels.eq.{}",
        ]

    for filter_expr in passes:
        last_id = 0

        while True:
            remaining = (limit - total_processed) if limit is not None else batch_size
            if remaining <= 0:
                break
            current_batch_size = min(batch_size, remaining)

            def _select_query(lid=last_id, bs=current_batch_size, filt=filter_expr):
                q = client_ref[0].table("tenders_raw").select("id,region,cpv_codes")
                if filt is not None:
                    q = q.or_(filt)
                return q.gt("id", lid).order("id").limit(bs)

            response = _execute_with_retry(_select_query, refresh_client)
            batch = response.data or []
            if not batch:
                break

            last_id = batch[-1]["id"]

            # Translate each row and group by (region_label, cpv_labels) to minimise
            # the number of UPDATE calls (many tenders share the same NUTS code).
            groups: dict[tuple[str, tuple[str, ...]], list[int]] = defaultdict(list)
            for row in batch:
                region_label = _translate_region(row.get("region") or "")
                all_cpv_labels = tuple(_translate_cpv_codes(row.get("cpv_codes") or [], cpv_labels))
                groups[(region_label, all_cpv_labels)].append(row["id"])

            # Bulk-update each group in chunks that respect URL length limits.
            for (region_label, all_cpv_labels), ids in groups.items():
                for i in range(0, len(ids), _CHUNK_SIZE):
                    chunk = ids[i : i + _CHUNK_SIZE]
                    _execute_with_retry(
                        lambda c=chunk, rl=region_label, al=list(all_cpv_labels): client_ref[0]
                        .table("tenders_raw")
                        .update({"region_label": rl, "cpv_labels": al})
                        .in_("id", c),
                        refresh_client,
                    )
                    total_updated += len(chunk)

            total_processed += len(batch)
            logger.info(
                "Enriched batch of %d tenders (total processed: %d, updated: %d)",
                len(batch),
                total_processed,
                total_updated,
            )

            if len(batch) < current_batch_size:
                break

    return {"processed": total_processed, "updated": total_updated}
