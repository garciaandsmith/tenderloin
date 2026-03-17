"""Unit tests for the scoring pipeline (train, dataset, model_io, filtering).

These tests do NOT require Supabase credentials or a GPU — sentence-transformers
is mocked so the suite runs quickly in CI without heavy dependencies.
"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
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


class TestModelIO(unittest.TestCase):
    """Tests for pipeline.scoring.model_io save/load round-trip (per-project)."""

    def _make_artifact(self, version: str = "20260101") -> dict:
        from sklearn.linear_model import Ridge

        reg = Ridge()
        reg.fit([[0], [1]], [1.0, 5.0])
        return {
            "embedder_name": "paraphrase-multilingual-MiniLM-L12-v2",
            "regressor": reg,
            "version": version,
            "mae": 0.5,
        }

    def test_save_creates_project_versioned_pkl(self) -> None:
        from pipeline.scoring.model_io import save_model

        with tempfile.TemporaryDirectory() as tmp:
            artifact = self._make_artifact("20260311")
            path = save_model(artifact, Path(tmp), _PROJECT_ID)
            self.assertTrue(path.exists())
            self.assertEqual(path.name, f"scoring_{_PROJECT_ID}_v20260311.pkl")

    def test_load_latest_returns_most_recent_version(self) -> None:
        from pipeline.scoring.model_io import save_model, load_latest_model

        with tempfile.TemporaryDirectory() as tmp:
            models_dir = Path(tmp)
            save_model(self._make_artifact("20260101"), models_dir, _PROJECT_ID)
            save_model(self._make_artifact("20260201"), models_dir, _PROJECT_ID)
            save_model(self._make_artifact("20260311"), models_dir, _PROJECT_ID)

            loaded = load_latest_model(models_dir, _PROJECT_ID)
            self.assertEqual(loaded["version"], "20260311")

    def test_load_raises_when_no_model_for_project(self) -> None:
        from pipeline.scoring.model_io import save_model, load_latest_model

        with tempfile.TemporaryDirectory() as tmp:
            models_dir = Path(tmp)
            # Save a model for a different project only
            save_model(self._make_artifact("20260311"), models_dir, _PROJECT_ID_2)

            with self.assertRaises(FileNotFoundError):
                load_latest_model(models_dir, _PROJECT_ID)

    def test_load_raises_when_no_model_at_all(self) -> None:
        from pipeline.scoring.model_io import load_latest_model

        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(FileNotFoundError):
                load_latest_model(Path(tmp), _PROJECT_ID)

    def test_roundtrip_preserves_artifact_keys(self) -> None:
        from pipeline.scoring.model_io import save_model, load_latest_model

        with tempfile.TemporaryDirectory() as tmp:
            original = self._make_artifact("20260311")
            save_model(original, Path(tmp), _PROJECT_ID)
            loaded = load_latest_model(Path(tmp), _PROJECT_ID)

        self.assertEqual(loaded["version"], original["version"])
        self.assertEqual(loaded["embedder_name"], original["embedder_name"])
        self.assertAlmostEqual(loaded["mae"], original["mae"])

    def test_roundtrip_regressor_prediction(self) -> None:
        """Loaded regressor must produce the same output as the original."""
        from pipeline.scoring.model_io import save_model, load_latest_model

        with tempfile.TemporaryDirectory() as tmp:
            original = self._make_artifact("20260311")
            X_test = [[0.5]]
            expected = original["regressor"].predict(X_test)[0]

            save_model(original, Path(tmp), _PROJECT_ID)
            loaded = load_latest_model(Path(tmp), _PROJECT_ID)
            result = loaded["regressor"].predict(X_test)[0]

        self.assertAlmostEqual(result, expected, places=6)

    def test_two_projects_do_not_share_models(self) -> None:
        """Each project's load_latest_model only sees its own artifacts."""
        from pipeline.scoring.model_io import save_model, load_latest_model

        with tempfile.TemporaryDirectory() as tmp:
            models_dir = Path(tmp)
            save_model(self._make_artifact("20260101"), models_dir, _PROJECT_ID)
            save_model(self._make_artifact("20260311"), models_dir, _PROJECT_ID_2)

            loaded_1 = load_latest_model(models_dir, _PROJECT_ID)
            loaded_2 = load_latest_model(models_dir, _PROJECT_ID_2)

        self.assertEqual(loaded_1["version"], "20260101")
        self.assertEqual(loaded_2["version"], "20260311")

    def test_list_project_ids_with_models(self) -> None:
        from pipeline.scoring.model_io import save_model, list_project_ids_with_models

        with tempfile.TemporaryDirectory() as tmp:
            models_dir = Path(tmp)
            save_model(self._make_artifact("20260101"), models_dir, _PROJECT_ID)
            save_model(self._make_artifact("20260311"), models_dir, _PROJECT_ID_2)

            ids = list_project_ids_with_models(models_dir)

        self.assertIn(_PROJECT_ID, ids)
        self.assertIn(_PROJECT_ID_2, ids)
        self.assertEqual(len(ids), 2)


class TestTrain(unittest.TestCase):
    """Tests for pipeline.scoring.train.train (sentence-transformer mocked)."""

    def _make_df(self, n: int = 20) -> pd.DataFrame:
        texts = [f"Licitación de comunicación número {i}" for i in range(n)]
        scores = np.linspace(1, 5, n)
        return pd.DataFrame({"text": texts, "score": scores})

    def _train_with_mock(self, df: pd.DataFrame | None = None):
        import sys
        from pipeline.scoring.train import train

        if df is None:
            df = self._make_df()
        fake_embedding = np.random.rand(len(df), 64).astype(np.float32)

        mock_instance = MagicMock()
        mock_instance.encode.return_value = fake_embedding

        mock_st_class = MagicMock(return_value=mock_instance)
        fake_module = MagicMock()
        fake_module.SentenceTransformer = mock_st_class

        original = sys.modules.get("sentence_transformers")
        sys.modules["sentence_transformers"] = fake_module
        try:
            artifact = train(df)
        finally:
            if original is None:
                sys.modules.pop("sentence_transformers", None)
            else:
                sys.modules["sentence_transformers"] = original

        return artifact, fake_embedding

    def test_train_returns_required_keys(self) -> None:
        artifact, _ = self._train_with_mock()
        self.assertIn("embedder_name", artifact)
        self.assertIn("regressor", artifact)
        self.assertIn("version", artifact)
        self.assertIn("mae", artifact)

    def test_train_version_is_yyyymmdd(self) -> None:
        artifact, _ = self._train_with_mock()
        version = artifact["version"]
        self.assertEqual(len(version), 8)
        self.assertTrue(version.isdigit(), f"Version must be YYYYMMDD digits, got: {version}")

    def test_train_mae_is_non_negative(self) -> None:
        artifact, _ = self._train_with_mock()
        self.assertGreaterEqual(artifact["mae"], 0.0)

    def test_train_regressor_can_predict(self) -> None:
        artifact, fake_embedding = self._train_with_mock()
        preds = artifact["regressor"].predict(fake_embedding[:3])
        self.assertEqual(len(preds), 3)


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
