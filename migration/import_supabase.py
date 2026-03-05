"""Step 2 of data migration: import exported SQLite data into Supabase.

Requires migration/export_sqlite.py to have been run first.

Set environment variables before running:
    export SUPABASE_URL=https://xxxx.supabase.co
    export SUPABASE_SERVICE_ROLE_KEY=eyJ...

Run from the project root:
    python migration/import_supabase.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

EXPORT_DIR = Path("migration/export")
CHUNK_SIZE = 500


def main() -> None:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.")
        sys.exit(1)

    try:
        from supabase import create_client
    except ImportError:
        print("ERROR: supabase-py not installed. Run: pip install supabase")
        sys.exit(1)

    client = create_client(url, key)

    # ── Tenders ──────────────────────────────────────────────────────────────
    tenders_path = EXPORT_DIR / "tenders_export.json"
    if not tenders_path.exists():
        print(f"ERROR: {tenders_path} not found. Run migration/export_sqlite.py first.")
        sys.exit(1)

    tenders = json.loads(tenders_path.read_text())
    total_inserted = 0

    for i in range(0, len(tenders), CHUNK_SIZE):
        chunk = tenders[i : i + CHUNK_SIZE]
        # Remove the SQLite auto-increment id; Supabase assigns its own bigserial id.
        for row in chunk:
            row.pop("id", None)
        response = (
            client.table("tenders_raw")
            .upsert(chunk, on_conflict="external_id,source", ignore_duplicates=True)
            .execute()
        )
        inserted = len(response.data) if response.data else 0
        total_inserted += inserted
        print(f"  tenders batch {i // CHUNK_SIZE + 1}: {inserted} inserted")

    print(f"Tenders: {total_inserted} / {len(tenders)} inserted (duplicates skipped)")

    # ── Pipeline state ────────────────────────────────────────────────────────
    state_path = EXPORT_DIR / "state_export.json"
    if state_path.exists():
        state = json.loads(state_path.read_text())
        for row in state:
            client.table("pipeline_state").upsert(row).execute()
        print(f"Pipeline state: {len(state)} rows imported")


if __name__ == "__main__":
    main()
