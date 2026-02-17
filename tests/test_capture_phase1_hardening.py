from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.capture.placsp_client import PlacspClient, PlacspClientConfig
from app.capture.service import CaptureService
from app.capture.state_store import StateStore
from app.capture.storage import RawTenderRepository


class CapturePhase1HardeningTests(unittest.TestCase):
    def test_storage_deduplicates_by_external_id_and_source(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            payload_path = Path(tmpdir) / "data.json"
            payload_path.write_text(
                json.dumps(
                    {
                        "items": [
                            {
                                "external_id": "exp-001",
                                "title": "Contrato 1",
                                "summary": "Resumen",
                                "link": "https://example.org/1",
                                "published_at": "2026-01-01T12:00:00+00:00",
                            }
                        ]
                    }
                )
            )

            db_path = Path(tmpdir) / "capture.db"
            client = PlacspClient(PlacspClientConfig(source_url=f"file://{payload_path}"))
            repo = RawTenderRepository(db_path)
            state = StateStore(db_path)
            service = CaptureService(client=client, repository=repo, state_store=state)

            first = service.run()
            second = service.run()

            self.assertEqual(first.inserted, 1)
            self.assertEqual(second.inserted, 0)
            with sqlite3.connect(db_path) as conn:
                total = conn.execute("SELECT COUNT(*) FROM tenders_raw").fetchone()[0]
            self.assertEqual(total, 1)

    def test_state_store_persists_last_run(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "capture.db"
            state = StateStore(db_path)

            now = datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc)
            state.set_last_run_at(now)

            stored = state.get_last_run_at()
            self.assertIsNotNone(stored)
            self.assertEqual(stored, now)

    def test_capture_service_uses_overlap_window_for_since(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            payload_path = Path(tmpdir) / "data.json"
            payload_path.write_text(
                json.dumps(
                    {
                        "items": [
                            {
                                "external_id": "exp-001",
                                "title": "Contrato 1",
                                "summary": "Resumen",
                                "link": "https://example.org/1",
                                "published_at": "2026-01-01T12:00:00+00:00",
                            }
                        ]
                    }
                )
            )

            db_path = Path(tmpdir) / "capture.db"
            client = PlacspClient(PlacspClientConfig(source_url=f"file://{payload_path}"))
            repo = RawTenderRepository(db_path)
            state = StateStore(db_path)

            previous = datetime(2026, 1, 2, 8, 0, tzinfo=timezone.utc)
            state.set_last_run_at(previous)

            service = CaptureService(
                client=client,
                repository=repo,
                state_store=state,
                overlap_minutes=30,
            )
            result = service.run()

            self.assertIsNotNone(result.effective_since)
            self.assertEqual(result.effective_since, previous - timedelta(minutes=30))

    def test_atom_parsing_extracts_business_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            payload_path = Path(tmpdir) / "feed.xml"
            payload_path.write_text(
                """<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<feed xmlns=\"http://www.w3.org/2005/Atom\" xmlns:cbc=\"urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2\">
  <entry>
    <id>exp-atom-001</id>
    <title>Contrato Atom</title>
    <summary>Resumen atom</summary>
    <updated>2026-01-10T09:00:00Z</updated>
    <link href=\"https://example.org/atom/1\" />
    <cbc:DeadlineDate>2026-02-10T12:00:00Z</cbc:DeadlineDate>
    <cbc:PartyName>Ayuntamiento de Madrid</cbc:PartyName>
    <cbc:NUTSCode>ES300</cbc:NUTSCode>
    <cbc:ItemClassificationCode>79341000</cbc:ItemClassificationCode>
    <cbc:TotalAmount>125000,50</cbc:TotalAmount>
  </entry>
</feed>
""",
                encoding="utf-8",
            )

            client = PlacspClient(PlacspClientConfig(source_url=f"file://{payload_path}"))
            tenders = client.fetch_since(None)

            self.assertEqual(len(tenders), 1)
            tender = tenders[0]
            self.assertEqual(tender.external_id, "exp-atom-001")
            self.assertEqual(tender.buyer_name, "Ayuntamiento de Madrid")
            self.assertEqual(tender.region, "ES300")
            self.assertEqual(tender.cpv, "79341000")
            self.assertAlmostEqual(tender.budget_amount or 0.0, 125000.50, places=2)
            self.assertIsNotNone(tender.deadline_at)


if __name__ == "__main__":
    unittest.main()
