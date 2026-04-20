"""Post-ingestion enrichment: translate raw NUTS and CPV codes to human-readable labels.

Reads tenders_raw rows where region_label IS NULL (or all rows on a full rescan),
translates the region and cpv fields using the NUTS and CPV lookup tables, then
writes the results back to the region_label and cpv_label columns.

The original region / cpv / cpv_codes columns are never modified so that the
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

# Extracts the first 8-digit CPV numeric code from a string that may contain
# mixed content like "45262520 · Trabajos de construcción".
_CPV_CODE_RE = re.compile(r"\b(\d{8})\b")

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


def _translate_cpv(cpv: str, cpv_labels: dict[str, str]) -> str:
    """Return a human-readable label for a CPV value.

    Handles the three formats PLACSP can produce:
    - Pure code:           "92000000"
    - Code + description:  "45262520 · Trabajos de construcción"
    - Pure description:    "Equipos médicos"

    For multi-code strings like "33696500 · 38434570 · Equipos médicos" the
    label for the first recognised code is returned.

    Empty / missing → returns "" (sentinel meaning "enriched, no data").
    """
    value = (cpv or "").strip()
    if not value:
        return ""
    match = _CPV_CODE_RE.search(value)
    if match:
        label = cpv_labels.get(match.group(1))
        if label:
            return label
        # Code exists but is not in our vocabulary — extract any trailing text.
        remainder = _CPV_CODE_RE.sub("", value).strip(" ·-–,")
        return remainder if remainder else match.group(1)
    # No numeric code found — the value is already descriptive text.
    return value


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
    offset = 0

    while True:
        remaining = (limit - total_processed) if limit is not None else batch_size
        if remaining <= 0:
            break
        current_batch_size = min(batch_size, remaining)

        def _select_query():
            q = client_ref[0].table("tenders_raw").select("id,region,cpv")
            if not full_rescan:
                q = q.is_("region_label", "null")
            return q.range(offset, offset + current_batch_size - 1)

        response = _execute_with_retry(_select_query, refresh_client)
        batch = response.data or []
        if not batch:
            break

        # Translate each row and group by (region_label, cpv_label) to minimise
        # the number of UPDATE calls (many tenders share the same NUTS code).
        groups: dict[tuple[str, str], list[int]] = defaultdict(list)
        for row in batch:
            region_label = _translate_region(row.get("region") or "")
            cpv_label = _translate_cpv(row.get("cpv") or "", cpv_labels)
            groups[(region_label, cpv_label)].append(row["id"])

        # Bulk-update each group in chunks that respect URL length limits.
        for (region_label, cpv_label), ids in groups.items():
            for i in range(0, len(ids), _CHUNK_SIZE):
                chunk = ids[i : i + _CHUNK_SIZE]
                _execute_with_retry(
                    lambda c=chunk, rl=region_label, cl=cpv_label: client_ref[0]
                    .table("tenders_raw")
                    .update({"region_label": rl, "cpv_label": cl})
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
        offset += current_batch_size

    return {"processed": total_processed, "updated": total_updated}
