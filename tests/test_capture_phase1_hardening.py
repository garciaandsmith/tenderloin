from __future__ import annotations

import io
import json
import sqlite3
import tempfile
import unittest
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, call, patch

from pipeline.capture.placsp_client import PlacspClient, PlacspClientConfig, _parse_datetime
from pipeline.capture.service import CaptureService
from pipeline.capture.state_store import StateStore
from pipeline.capture.storage import RawTenderRepository


class CapturePhase1HardeningTests(unittest.TestCase):
    def test_storage_upserts_and_updates_existing_rows(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            payload_path = Path(tmpdir) / "data.json"

            # First run: tender published with no status and a typo in the deadline year
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
                                "deadline_at": "2030-02-01T00:00:00+00:00",  # typo: should be 2026
                                "status": None,
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
            self.assertEqual(first.upserted, 1)

            with sqlite3.connect(db_path) as conn:
                row = conn.execute(
                    "SELECT status, deadline_at, created_at, updated_at FROM tenders_raw WHERE external_id='exp-001'"
                ).fetchone()
            self.assertIsNone(row[0])  # status is None
            self.assertIn("2030", row[1])  # typo still present
            created_at_first = row[2]
            self.assertIsNotNone(row[3])  # updated_at is set

            # Second run: source corrects the deadline and advances the status to ADJ
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
                                "deadline_at": "2026-02-01T00:00:00+00:00",  # corrected
                                "status": "ADJ",
                            }
                        ]
                    }
                )
            )

            second = service.run()
            self.assertEqual(second.upserted, 1)

            with sqlite3.connect(db_path) as conn:
                total = conn.execute("SELECT COUNT(*) FROM tenders_raw").fetchone()[0]
                row = conn.execute(
                    "SELECT status, deadline_at, created_at, updated_at FROM tenders_raw WHERE external_id='exp-001'"
                ).fetchone()

            self.assertEqual(total, 1)            # no duplicate row created
            self.assertEqual(row[0], "ADJ")       # status updated
            self.assertIn("2026", row[1])          # deadline corrected
            self.assertEqual(row[2], created_at_first)  # created_at preserved
            self.assertGreaterEqual(row[3], row[2])     # updated_at >= created_at

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
<feed xmlns=\"http://www.w3.org/2005/Atom\"
      xmlns:cbc=\"urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2\"
      xmlns:cac=\"urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2\">
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
    <cac:ProcurementProject>
      <cbc:TypeCode>5</cbc:TypeCode>
    </cac:ProcurementProject>
    <cbc:ProcedureCode>1</cbc:ProcedureCode>
    <cac:ProcurementProjectLot><cbc:ID>1</cbc:ID></cac:ProcurementProjectLot>
    <cac:ProcurementProjectLot><cbc:ID>2</cbc:ID></cac:ProcurementProjectLot>
    <cbc:DurationMeasure unitCode=\"MON\">12</cbc:DurationMeasure>
    <cbc:ContractingPartyTypeCode>5</cbc:ContractingPartyTypeCode>
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
            self.assertAlmostEqual(tender.budget_amount or 0.0, 125000.50, places=2)
            self.assertIsNotNone(tender.deadline_at)
            self.assertEqual(tender.contract_type, "services")
            self.assertEqual(tender.procedure_type, "open")
            self.assertEqual(tender.lot_count, 2)
            self.assertEqual(tender.duration_months, 12)
            self.assertEqual(tender.buyer_type, "local_entity")

    def test_atom_parsing_supports_spanish_deadline_text(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            payload_path = Path(tmpdir) / "feed.xml"
            payload_path.write_text(
                """<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<feed xmlns=\"http://www.w3.org/2005/Atom\"
      xmlns:cbc=\"urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2\">
  <entry>
    <id>exp-atom-002</id>
    <title>Contrato Atom 2</title>
    <summary>Resumen atom 2</summary>
    <updated>2026-01-10T09:00:00Z</updated>
    <cbc:PresentationPeriod>Hasta el 12/05/2026 23:59</cbc:PresentationPeriod>
  </entry>
</feed>
""",
                encoding="utf-8",
            )

            client = PlacspClient(PlacspClientConfig(source_url=f"file://{payload_path}"))
            tenders = client.fetch_since(None)

            self.assertEqual(len(tenders), 1)
            tender = tenders[0]
            self.assertEqual(
                tender.deadline_at,
                datetime(2026, 5, 12, 23, 59, tzinfo=timezone.utc),
            )


class ParseDatetimeTimezoneTests(unittest.TestCase):
    def test_naive_iso_string_gets_utc(self) -> None:
        result = _parse_datetime("2026-02-10T09:00:00")
        self.assertIsNotNone(result)
        self.assertIsNotNone(result.tzinfo)
        self.assertEqual(result.tzinfo, timezone.utc)
        self.assertEqual(result.replace(tzinfo=None), datetime(2026, 2, 10, 9, 0, 0))

    def test_date_only_string_gets_utc_midnight(self) -> None:
        result = _parse_datetime("2026-02-10")
        self.assertIsNotNone(result)
        self.assertIsNotNone(result.tzinfo)
        self.assertEqual(result, datetime(2026, 2, 10, 0, 0, tzinfo=timezone.utc))

    def test_z_suffix_string_is_utc(self) -> None:
        result = _parse_datetime("2026-02-10T09:00:00Z")
        self.assertIsNotNone(result)
        self.assertIsNotNone(result.tzinfo)
        self.assertEqual(result, datetime(2026, 2, 10, 9, 0, tzinfo=timezone.utc))

    def test_offset_aware_string_preserves_offset(self) -> None:
        result = _parse_datetime("2026-02-10T09:00:00+02:00")
        self.assertIsNotNone(result)
        self.assertIsNotNone(result.tzinfo)
        self.assertEqual(result.utcoffset().total_seconds(), 7200)

    def test_zip_since_filter_with_naive_updated_does_not_raise(self) -> None:
        """_fetch_zip must not raise TypeError when published_at is naive and since is aware."""
        xml_content = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<feed xmlns="http://www.w3.org/2005/Atom">'
            "<entry>"
            "<id>exp-naive-zip-001</id>"
            "<title>Contrato Naive</title>"
            "<summary>Resumen</summary>"
            "<updated>2026-01-10T09:00:00</updated>"  # no timezone
            "</entry>"
            "</feed>"
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w") as zf:
                zf.writestr("feed.xml", xml_content)
            zip_path = Path(tmpdir) / "data.zip"
            zip_path.write_bytes(buf.getvalue())

            since = datetime(2026, 1, 9, 0, 0, tzinfo=timezone.utc)
            client = PlacspClient(PlacspClientConfig(source_url=f"file://{zip_path}"))
            tenders = client.fetch_since(since)
            self.assertIsInstance(tenders, list)
            self.assertEqual(len(tenders), 1)
            self.assertIsNotNone(tenders[0].published_at.tzinfo)


class SupabaseUpsertRetryTests(unittest.TestCase):
    def _make_repo(self, mock_client):
        from pipeline.capture.storage_supabase import SupabaseRawTenderRepository

        repo = object.__new__(SupabaseRawTenderRepository)
        repo._client = mock_client
        repo._cpv_labels = {}
        return repo

    def _make_tender(self):
        from pipeline.capture.models import TenderRaw

        return TenderRaw(
            external_id="t-001",
            title="Test",
            summary="Summary",
            link="https://example.org/1",
            published_at=datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc),
            deadline_at=None,
            buyer_name="Buyer",
            region="ES300",
            budget_amount=1000.0,
        )

    def test_upsert_succeeds_without_retry_on_first_attempt(self) -> None:
        mock_client = MagicMock()
        mock_client.table.return_value.upsert.return_value.execute.return_value.data = [{"id": 1}]
        repo = self._make_repo(mock_client)
        captured_at = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)

        result = repo.upsert_many([self._make_tender()], captured_at)

        self.assertEqual(result, 1)
        self.assertEqual(mock_client.table.return_value.upsert.call_count, 1)
        sent = mock_client.table.return_value.upsert.call_args[0][0]
        self.assertNotIn("cpv", sent[0])

    def test_upsert_retries_with_cpv_on_not_null_error(self) -> None:
        mock_upsert = MagicMock()
        mock_client = MagicMock()
        mock_client.table.return_value.upsert = mock_upsert

        cpv_error = Exception(
            '{"code":"23502","message":"null value in column \\"cpv\\" of relation \\"tenders_raw\\" violates not-null constraint"}'
        )
        success_response = MagicMock()
        success_response.data = [{"id": 1}]
        mock_upsert.return_value.execute.side_effect = [cpv_error, None]
        mock_upsert.return_value.execute.side_effect = [cpv_error]

        # First call raises; second call succeeds
        execute_mock = MagicMock()
        execute_mock.side_effect = [cpv_error, success_response]
        mock_upsert.return_value.execute = execute_mock

        repo = self._make_repo(mock_client)
        captured_at = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)

        result = repo.upsert_many([self._make_tender()], captured_at)

        self.assertEqual(result, 1)
        self.assertEqual(execute_mock.call_count, 2)
        retry_payload = mock_upsert.call_args_list[1][0][0]
        self.assertIn("cpv", retry_payload[0])
        self.assertEqual(retry_payload[0]["cpv"], "")

    def test_upsert_reraises_non_cpv_errors(self) -> None:
        mock_client = MagicMock()
        mock_client.table.return_value.upsert.return_value.execute.side_effect = RuntimeError(
            "connection refused"
        )
        repo = self._make_repo(mock_client)
        captured_at = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)

        with self.assertRaises(RuntimeError):
            repo.upsert_many([self._make_tender()], captured_at)


if __name__ == "__main__":
    unittest.main()
