from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Iterable

from app.capture.models import TenderRaw


class RawTenderRepository:
    """Store raw capture output in SQLite and protect against duplicates."""

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
                CREATE TABLE IF NOT EXISTS tenders_raw (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    external_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    link TEXT NOT NULL,
                    published_at TEXT NOT NULL,
                    deadline_at TEXT,
                    buyer_name TEXT NOT NULL,
                    region TEXT NOT NULL,
                    cpv TEXT NOT NULL,
                    budget_amount REAL,
                    source TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE (external_id, source)
                )
                """
            )

    def upsert_many(self, tenders: Iterable[TenderRaw], captured_at: datetime) -> int:
        rows = [
            (
                item.external_id,
                item.title,
                item.summary,
                item.link,
                item.published_at.isoformat(),
                item.deadline_at.isoformat() if item.deadline_at else None,
                item.buyer_name,
                item.region,
                item.cpv,
                item.budget_amount,
                item.source,
                captured_at.isoformat(),
            )
            for item in tenders
        ]
        if not rows:
            return 0

        with self._connect() as conn:
            before = conn.total_changes
            conn.executemany(
                """
                INSERT OR IGNORE INTO tenders_raw (
                    external_id,
                    title,
                    summary,
                    link,
                    published_at,
                    deadline_at,
                    buyer_name,
                    region,
                    cpv,
                    budget_amount,
                    source,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )
            inserted = conn.total_changes - before
        return inserted
