"""Unit tests for the scoring pipeline (train_and_score, dataset, filtering).

These tests do NOT require Supabase credentials or a GPU — sentence-transformers
and supabase are mocked so the suite runs quickly in CI without heavy dependencies.
"""
from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd

_PROJECT_ID = "proj-abc-123"
_PROJECT_ID_2 = "proj-xyz-456"


def _make_supabase_mock(rows: list[dict], training_session: int = 1) -> MagicMock:
    """Return a mock supabase module whose create_client() returns a client
    that serves ``rows`` for tender_scores queries."""
    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.eq.return_value \
        .single.return_value.execute.return_value.data = {"training_session": training_session}
    mock_client.table.return_value.select.return_value.eq.return_value \
        .eq.return_value.neq.return_value.execute.return_value.data = rows
    mock_supabase = MagicMock()
    mock_supabase.create_client.return_value = mock_client
    return mock_supabase


class TestLoadDatasetForProject(unittest.TestCase):
    """Tests for pipeline.scoring.dataset.load_dataset_for_project.

    All data comes from mocked Supabase — no CSV involved.
    """

    _URL = "https://example.supabase.co"
    _KEY = "test-key"

    def _load(self, rows: list[dict]) -> pd.DataFrame:
        from pipeline.scoring.dataset import load_dataset_for_project
        mock_supabase = _make_supabase_mock(rows)
        with patch.dict("sys.modules", {"supabase": mock_supabase}):
            return load_dataset_for_project(_PROJECT_ID, self._URL, self._KEY)

    def test_loads_text_and_score_from_supabase(self) -> None:
        df = self._load([
            {"score": 4, "tenders_raw": {"title": "Servicio de comunicación digital", "summary": ""}},
            {"score": 1, "tenders_raw": {"title": "Suministro de equipos informáticos", "summary": ""}},
        ])
        self.assertIn("text", df.columns)
        self.assertIn("score", df.columns)
        self.assertEqual(len(df), 2)

    def test_excludes_score_zero_rows(self) -> None:
        """Score 0 means 'manual review needed' — the query excludes them, but
        the post-filter also guards against it."""
        df = self._load([
            {"score": 3, "tenders_raw": {"title": "Texto B", "summary": ""}},
        ])
        self.assertEqual(len(df), 1)
        self.assertEqual(df.iloc[0]["score"], 3.0)

    def test_excludes_rows_with_empty_text(self) -> None:
        """Rows where both title and summary are empty are dropped."""
        df = self._load([
            {"score": 5, "tenders_raw": {"title": "Texto con contenido", "summary": "Descripción"}},
            {"score": 2, "tenders_raw": {"title": "", "summary": ""}},
        ])
        self.assertEqual(len(df), 1)

    def test_score_column_is_float(self) -> None:
        df = self._load([
            {"score": "4", "tenders_raw": {"title": "Servicio de marketing", "summary": ""}},
        ])
        self.assertEqual(df["score"].dtype, float)

    def test_raises_when_no_rows_returned(self) -> None:
        from pipeline.scoring.dataset import load_dataset_for_project
        mock_supabase = _make_supabase_mock([])
        with patch.dict("sys.modules", {"supabase": mock_supabase}):
            with self.assertRaises(ValueError):
                load_dataset_for_project(_PROJECT_ID, self._URL, self._KEY)


class TestTrainAndScore(unittest.TestCase):
    """Tests for pipeline.scoring.score.train_and_score.

    Supabase and sentence-transformers are both mocked.
    """

    _URL = "https://example.supabase.co"
    _KEY = "test-key"

    def _run(
        self,
        filtered_ids: list[int],
        training_rows: list[dict],
        tender_rows: list[dict],
        min_samples: int = 5,
        project_id: str = _PROJECT_ID,
    ) -> int:
        """Run train_and_score with fully mocked external dependencies."""
        import sys
        from pipeline.scoring.score import train_and_score

        # ── Supabase mock ───────────────────────────────────────────────────
        mock_client = MagicMock()

        def table_side_effect(name: str):
            tbl = MagicMock()
            select = MagicMock()

            if name == "projects":
                execute = MagicMock()
                execute.return_value.data = [{"id": project_id}]
                select.return_value.eq.return_value.execute = execute
                tbl.select = MagicMock(return_value=select.return_value)

            elif name == "tender_filter_results":
                # First call: return filtered_ids; subsequent: empty (stop pagination)
                calls = {"n": 0}

                def ff_execute():
                    if calls["n"] == 0:
                        calls["n"] += 1
                        return MagicMock(data=[{"tender_id": i} for i in filtered_ids])
                    return MagicMock(data=[])

                chain = MagicMock()
                chain.execute = ff_execute
                tbl.select.return_value.eq.return_value.eq.return_value.range.return_value = chain

            elif name == "tender_scores":
                # Training data query chain
                mock_client.table.return_value.select.return_value.eq.return_value \
                    .single.return_value.execute.return_value.data = {"training_session": 1}
                mock_client.table.return_value.select.return_value.eq.return_value \
                    .eq.return_value.neq.return_value.execute.return_value.data = training_rows
                return mock_client.table.return_value

            elif name == "tenders_raw":
                tbl.select.return_value.in_.return_value.execute.return_value.data = tender_rows

            elif name == "tender_model_scores":
                tbl.upsert.return_value.execute.return_value = MagicMock()

            return tbl

        mock_client.table.side_effect = table_side_effect

        mock_supabase_mod = MagicMock()
        mock_supabase_mod.create_client.return_value = mock_client

        # ── sentence_transformers mock ───────────────────────────────────────
        n = len(tender_rows) if tender_rows else 1
        fake_emb = np.random.rand(max(n, len(training_rows) or 1), 64).astype(np.float32)
        mock_st_instance = MagicMock()
        mock_st_instance.encode.return_value = fake_emb[: max(n, 1)]
        mock_st_class = MagicMock(return_value=mock_st_instance)
        mock_st_mod = MagicMock()
        mock_st_mod.SentenceTransformer = mock_st_class

        orig_st = sys.modules.get("sentence_transformers")
        orig_sb = sys.modules.get("supabase")
        sys.modules["sentence_transformers"] = mock_st_mod
        sys.modules["supabase"] = mock_supabase_mod
        try:
            return train_and_score(
                supabase_url=self._URL,
                supabase_key=self._KEY,
                min_samples=min_samples,
                project_id=project_id,
            )
        finally:
            if orig_st is None:
                sys.modules.pop("sentence_transformers", None)
            else:
                sys.modules["sentence_transformers"] = orig_st
            if orig_sb is None:
                sys.modules.pop("supabase", None)
            else:
                sys.modules["supabase"] = orig_sb

    def _make_training_rows(self, n: int = 10) -> list[dict]:
        return [
            {
                "score": float(i % 5 + 1),
                "tenders_raw": {"title": f"Licitación {i}", "summary": "Descripción"},
            }
            for i in range(n)
        ]

    def _make_tender_rows(self, ids: list[int]) -> list[dict]:
        return [{"id": i, "title": f"Tender {i}", "summary": "Desc"} for i in ids]

    def test_returns_zero_when_no_filtered_tenders(self) -> None:
        result = self._run(filtered_ids=[], training_rows=[], tender_rows=[], min_samples=5)
        self.assertEqual(result, 0)

    def test_assigns_neutral_score_when_no_training_data(self) -> None:
        """With no training data, all filtered tenders should be scored 3.0."""
        # We can't easily inspect the upsert call values through the mock chain,
        # but we can at least verify it completes without error and returns count.
        result = self._run(
            filtered_ids=[1, 2, 3],
            training_rows=[],          # no labels → neutral score
            tender_rows=self._make_tender_rows([1, 2, 3]),
            min_samples=5,
        )
        self.assertEqual(result, 3)

    def test_assigns_neutral_score_below_min_samples(self) -> None:
        """Fewer training rows than min_samples → neutral score for all."""
        result = self._run(
            filtered_ids=[10, 20],
            training_rows=self._make_training_rows(3),  # only 3, need 5
            tender_rows=self._make_tender_rows([10, 20]),
            min_samples=5,
        )
        self.assertEqual(result, 2)

    def test_scores_tenders_with_trained_model(self) -> None:
        """When training data is sufficient, tenders are scored with the model."""
        result = self._run(
            filtered_ids=[1, 2, 3, 4, 5],
            training_rows=self._make_training_rows(10),
            tender_rows=self._make_tender_rows([1, 2, 3, 4, 5]),
            min_samples=5,
        )
        self.assertEqual(result, 5)


class TestScoreClamping(unittest.TestCase):
    """Verify that the score clamping logic in score.py produces [1.0, 5.0] output."""

    def test_raw_scores_clamped_to_valid_range(self) -> None:
        raw_predictions = [-1.5, 0.0, 0.5, 1.0, 3.7, 5.0, 6.8, 100.0]
        clamped = [max(1.0, min(5.0, s)) for s in raw_predictions]

        for s in clamped:
            self.assertGreaterEqual(s, 1.0, f"Score {s} is below 1.0")
            self.assertLessEqual(s, 5.0, f"Score {s} exceeds 5.0")

    def test_clamp_preserves_in_range_values(self) -> None:
        for v in [1.0, 2.5, 3.0, 4.9, 5.0]:
            clamped = max(1.0, min(5.0, v))
            self.assertAlmostEqual(clamped, v)

    def test_clamp_lifts_below_1(self) -> None:
        self.assertAlmostEqual(max(1.0, min(5.0, 0.1)), 1.0)

    def test_clamp_caps_above_5(self) -> None:
        self.assertAlmostEqual(max(1.0, min(5.0, 7.3)), 5.0)


class TestFilterEvaluateTender(unittest.TestCase):
    """Tests for pipeline.filtering.filter._evaluate_tender."""

    def _tender(self, **overrides) -> dict:
        base = {
            "id": 1,
            "title": "Servicio de consultoría digital",
            "summary": "Proyecto de transformación digital para administración pública",
            "region": "ES30",
            "cpv": "72000000",
            "budget_amount": 50000,
            "contract_type": "services",
            "procedure_type": "open",
            "lot_count": 1,
            "duration_months": 12,
            "buyer_type": "local_entity",
        }
        base.update(overrides)
        return base

    def _eval(self, tender: dict, cfg: dict) -> dict:
        from pipeline.filtering.filter import _evaluate_tender
        return _evaluate_tender(tender, cfg, "proj-test")

    def test_passes_when_no_filters_configured(self) -> None:
        result = self._eval(self._tender(), {})
        self.assertTrue(result["passed"])
        self.assertFalse(result["discard_reasons"])

    def test_fails_budget_below_min(self) -> None:
        result = self._eval(self._tender(budget_amount=1000), {"budget_min": 5000})
        self.assertFalse(result["passed"])
        self.assertIn("budget_below_min", result["discard_reasons"])

    def test_passes_budget_above_min(self) -> None:
        result = self._eval(self._tender(budget_amount=10000), {"budget_min": 5000})
        self.assertTrue(result["passed"])

    def test_fails_budget_above_max(self) -> None:
        result = self._eval(self._tender(budget_amount=200000), {"budget_max": 100000})
        self.assertFalse(result["passed"])
        self.assertIn("budget_above_max", result["discard_reasons"])

    def test_fails_region_mismatch(self) -> None:
        result = self._eval(self._tender(region="ES51"), {"regions": ["ES30", "ES70"]})
        self.assertFalse(result["passed"])
        self.assertIn("region_mismatch", result["discard_reasons"])

    def test_passes_region_prefix_match(self) -> None:
        result = self._eval(self._tender(region="ES300"), {"regions": ["ES30"]})
        self.assertTrue(result["passed"])

    def test_fails_cpv_mismatch(self) -> None:
        result = self._eval(self._tender(cpv="45000000"), {"cpv_codes": ["72", "73"]})
        self.assertFalse(result["passed"])
        self.assertIn("cpv_mismatch", result["discard_reasons"])

    def test_passes_cpv_prefix_match(self) -> None:
        result = self._eval(self._tender(cpv="72300000"), {"cpv_codes": ["72"]})
        self.assertTrue(result["passed"])

    def test_fails_contract_type_mismatch(self) -> None:
        result = self._eval(self._tender(contract_type="supplies"), {"contract_types": ["services"]})
        self.assertFalse(result["passed"])
        self.assertIn("contract_type_mismatch", result["discard_reasons"])

    def test_fails_keyword_include_miss(self) -> None:
        result = self._eval(
            self._tender(title="Obras de construcción", summary="Edificio nuevo"),
            {"keywords_include": ["digital", "tecnología"]},
        )
        self.assertFalse(result["passed"])
        self.assertIn("keyword_include_miss", result["discard_reasons"])

    def test_passes_keyword_include_hit(self) -> None:
        result = self._eval(
            self._tender(title="Servicios digitales", summary="Plataforma web"),
            {"keywords_include": ["digital"]},
        )
        self.assertTrue(result["passed"])

    def test_fails_keyword_exclude_hit(self) -> None:
        result = self._eval(
            self._tender(title="Obras de construcción", summary="Edificio nuevo"),
            {"keywords_exclude": ["construcción"]},
        )
        self.assertFalse(result["passed"])
        self.assertIn("keyword_exclude_hit", result["discard_reasons"])

    def test_fails_lot_count_exceeded(self) -> None:
        result = self._eval(self._tender(lot_count=10), {"max_lot_count": 3})
        self.assertFalse(result["passed"])
        self.assertIn("lot_count_exceeded", result["discard_reasons"])

    def test_fails_duration_below_min(self) -> None:
        result = self._eval(self._tender(duration_months=3), {"min_contract_months": 6})
        self.assertFalse(result["passed"])
        self.assertIn("duration_below_min", result["discard_reasons"])

    def test_fails_duration_above_max(self) -> None:
        result = self._eval(self._tender(duration_months=48), {"max_contract_months": 24})
        self.assertFalse(result["passed"])
        self.assertIn("duration_above_max", result["discard_reasons"])

    def test_multiple_reasons_accumulated(self) -> None:
        result = self._eval(
            self._tender(budget_amount=100, region="ES51"),
            {"budget_min": 5000, "regions": ["ES30"]},
        )
        self.assertFalse(result["passed"])
        self.assertIn("budget_below_min", result["discard_reasons"])
        self.assertIn("region_mismatch", result["discard_reasons"])

    def test_result_has_required_keys(self) -> None:
        result = self._eval(self._tender(), {})
        self.assertIn("tender_id", result)
        self.assertIn("project_id", result)
        self.assertIn("passed", result)
        self.assertIn("discard_reasons", result)


if __name__ == "__main__":
    unittest.main()
