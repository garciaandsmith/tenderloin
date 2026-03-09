from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


class StateStore:
    """Persist lightweight pipeline state, such as last successful capture timestamp."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_table()

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    def _ensure_table(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS pipeline_state (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

    def get_last_run_at(self, key: str = "capture.last_successful_run_at") -> Optional[datetime]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT value FROM pipeline_state WHERE key = ?",
                (key,),
            ).fetchone()
        if not row:
            return None
        return datetime.fromisoformat(row[0])

    def set_last_run_at(
        self,
        run_at: datetime,
        key: str = "capture.last_successful_run_at",
    ) -> None:
        if run_at.tzinfo is None:
            run_at = run_at.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO pipeline_state(key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE
                SET value = excluded.value,
                    updated_at = excluded.updated_at
                """,
                (key, run_at.isoformat(), now),
            )
