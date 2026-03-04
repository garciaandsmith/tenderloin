"""Step 1 of data migration: export SQLite data to JSON files.

Run from the project root:
    python migration/export_sqlite.py
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

DB_PATH = Path("data/runtime/tenderloin.db")
OUT_DIR = Path("migration/export")


def main() -> None:
    if not DB_PATH.exists():
        print(f"SQLite database not found at {DB_PATH}. Nothing to export.")
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    tenders = [dict(r) for r in conn.execute("SELECT * FROM tenders_raw").fetchall()]
    state = [dict(r) for r in conn.execute("SELECT * FROM pipeline_state").fetchall()]
    conn.close()

    tenders_path = OUT_DIR / "tenders_export.json"
    state_path = OUT_DIR / "state_export.json"

    tenders_path.write_text(json.dumps(tenders, default=str, ensure_ascii=False, indent=2))
    state_path.write_text(json.dumps(state, default=str, ensure_ascii=False, indent=2))

    print(f"Exported {len(tenders)} tenders → {tenders_path}")
    print(f"Exported {len(state)} state rows → {state_path}")


if __name__ == "__main__":
    main()
