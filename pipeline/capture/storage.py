from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Iterable

from pipeline.capture.models import TenderRaw


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
            for col, coltype in [
                ("contract_type", "TEXT"),
                ("procedure_type", "TEXT"),
                ("lot_count", "INTEGER"),
                ("duration_months", "INTEGER"),
                ("buyer_type", "TEXT"),
                ("status", "TEXT"),
                ("cpv_codes", "TEXT"),
                ("updated_at", "TEXT"),
            ]:
                try:
                    conn.execute(f"ALTER TABLE tenders_raw ADD COLUMN {col} {coltype}")
                except sqlite3.OperationalError:
                    pass  # column already exists

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
                captured_at.isoformat(),  # created_at — only used on first insert
                captured_at.isoformat(),  # updated_at — refreshed on every upsert
                item.contract_type,
                item.procedure_type,
                item.lot_count,
                item.duration_months,
                item.buyer_type,
                item.status,
                json.dumps(item.cpv_codes),
            )
            for item in tenders
        ]
        if not rows:
            return 0

        with self._connect() as conn:
            before = conn.total_changes
            conn.executemany(
                """
                INSERT INTO tenders_raw (
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
                    created_at,
                    updated_at,
                    contract_type,
                    procedure_type,
                    lot_count,
                    duration_months,
                    buyer_type,
                    status,
                    cpv_codes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (external_id, source) DO UPDATE SET
                    title           = excluded.title,
                    summary         = excluded.summary,
                    link            = excluded.link,
                    published_at    = excluded.published_at,
                    deadline_at     = excluded.deadline_at,
                    buyer_name      = excluded.buyer_name,
                    region          = excluded.region,
                    cpv             = excluded.cpv,
                    budget_amount   = excluded.budget_amount,
                    contract_type   = excluded.contract_type,
                    procedure_type  = excluded.procedure_type,
                    lot_count       = excluded.lot_count,
                    duration_months = excluded.duration_months,
                    buyer_type      = excluded.buyer_type,
                    status          = excluded.status,
                    cpv_codes       = excluded.cpv_codes,
                    updated_at      = excluded.updated_at
                -- created_at is intentionally excluded: existing rows keep their original capture timestamp
                """,
                rows,
            )
            upserted = conn.total_changes - before
        return upserted
