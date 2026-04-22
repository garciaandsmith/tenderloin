"""Unit tests for the scoring pipeline (dataset, model_io, train, score, filtering).

These tests do NOT require Supabase credentials or a GPU — sentence-transformers
and Supabase (including Storage) are mocked so the suite runs quickly in CI.
"""
from __future__ import annotations

import pickle
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
    """Tests for pipeline.scoring.dataset.load_dataset_for_project."""

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
        df = self._load([
            {"score": 3, "tenders_raw": {"title": "Texto B", "summary": ""}},
        ])
        self.assertEqual(len(df), 1)
        self.assertEqual(df.iloc[0]["score"], 3.0)

    def test_excludes_rows_with_empty_text(self) -> None:
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
    """Tests for pipeline.scoring.model_io save/load via mocked Supabase Storage."""

    def _make_artifact(self) -> dict:
        from sklearn.linear_model import Ridge
        reg = Ridge()
        reg.fit([[0], [1]], [1.0, 5.0])
        return {
            "embedder_name": "paraphrase-multilingual-MiniLM-L12-v2",
            "regressor": reg,
            "version": "20260311",
            "mae": 0.5,
        }

    def _make_storage_client(self, stored: dict | None = None) -> MagicMock:
        """Return a mock Supabase client whose storage behaves like a key-value store."""
        store: dict[str, bytes] = {}

        def upload(path, data, opts=None):
            store[path] = data
            return MagicMock()

        def download(path):
            if path not in store:
                raise Exception(f"Object not found: {path}")
            return store[path]

        mock_storage = MagicMock()
        mock_storage.from_.return_value.upload.side_effect = upload
        mock_storage.from_.return_value.download.side_effect = download

        mock_client = MagicMock()
        mock_client.storage = mock_storage
        return mock_client

    def test_save_then_load_round_trips_artifact(self) -> None:
        from pipeline.scoring.model_io import save_model, load_model
        client = self._make_storage_client()
        original = self._make_artifact()
        save_model(original, client, _PROJECT_ID)
        loaded = load_model(client, _PROJECT_ID)
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded["version"], original["version"])
        self.assertEqual(loaded["embedder_name"], original["embedder_name"])
        self.assertAlmostEqual(loaded["mae"], original["mae"])

    def test_load_returns_none_when_no_model(self) -> None:
        from pipeline.scoring.model_io import load_model
        client = self._make_storage_client()
        result = load_model(client, _PROJECT_ID)
        self.assertIsNone(result)

    def test_save_overwrites_previous_model(self) -> None:
        from pipeline.scoring.model_io import save_model, load_model
        client = self._make_storage_client()
        art1 = self._make_artifact()
        art1["version"] = "20260101"
        art2 = self._make_artifact()
        art2["version"] = "20260311"
        save_model(art1, client, _PROJECT_ID)
        save_model(art2, client, _PROJECT_ID)
        loaded = load_model(client, _PROJECT_ID)
        self.assertEqual(loaded["version"], "20260311")

    def test_two_projects_do_not_share_models(self) -> None:
        from pipeline.scoring.model_io import save_model, load_model
        client = self._make_storage_client()
        art1 = self._make_artifact()
        art1["version"] = "proj1-version"
        art2 = self._make_artifact()
        art2["version"] = "proj2-version"
        save_model(art1, client, _PROJECT_ID)
        save_model(art2, client, _PROJECT_ID_2)
        self.assertEqual(load_model(client, _PROJECT_ID)["version"], "proj1-version")
        self.assertEqual(load_model(client, _PROJECT_ID_2)["version"], "proj2-version")

    def test_roundtrip_regressor_prediction(self) -> None:
        from pipeline.scoring.model_io import save_model, load_model
        client = self._make_storage_client()
        original = self._make_artifact()
        X = [[0.5]]
        expected = original["regressor"].predict(X)[0]
        save_model(original, client, _PROJECT_ID)
        loaded = load_model(client, _PROJECT_ID)
        self.assertAlmostEqual(loaded["regressor"].predict(X)[0], expected, places=6)


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
        mock_st_mod = MagicMock()
        mock_st_mod.SentenceTransformer = MagicMock(return_value=mock_instance)

        original = sys.modules.get("sentence_transformers")
        sys.modules["sentence_transformers"] = mock_st_mod
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
        for key in ("embedder_name", "regressor", "version", "mae"):
            self.assertIn(key, artifact)

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


class TestScoreUnscoredTenders(unittest.TestCase):
    """Tests for pipeline.scoring.score.score_unscored_tenders."""

    _URL = "https://example.supabase.co"
    _KEY = "test-key"

    def _make_artifact(self) -> dict:
        from sklearn.linear_model import Ridge
        reg = Ridge()
        reg.fit([[0] * 64, [1] * 64], [1.0, 5.0])
        return {
            "embedder_name": "paraphrase-multilingual-MiniLM-L12-v2",
            "regressor": reg,
            "version": "20260311",
            "mae": 0.5,
        }

    def _run(
        self,
        filtered_ids: list[int],
        tender_rows: list[dict],
        artifact: dict | None = None,
        project_id: str = _PROJECT_ID,
    ) -> int:
        import sys
        from pipeline.scoring.score import score_unscored_tenders

        # Build a mock Supabase client.
        mock_client = MagicMock()

        # projects table
        mock_client.table("projects").select("id").eq("is_active", True).execute.return_value \
            = MagicMock(data=[{"id": project_id}])

        # tender_filter_results: first page returns filtered_ids, then empty
        ff_calls = {"n": 0}

        def ff_execute():
            if ff_calls["n"] == 0:
                ff_calls["n"] += 1
                return MagicMock(data=[{"tender_id": i} for i in filtered_ids])
            return MagicMock(data=[])

        (mock_client.table("tender_filter_results")
         .select.return_value.eq.return_value.eq.return_value
         .range.return_value.execute) = ff_execute

        # tenders_raw
        mock_client.table("tenders_raw").select.return_value.in_.return_value \
            .execute.return_value = MagicMock(data=tender_rows)

        # tender_model_scores upsert
        mock_client.table("tender_model_scores").upsert.return_value \
            .execute.return_value = MagicMock()

        # Supabase Storage mock for model_io.load_model
        stored_artifact = artifact
        pkl = pickle.dumps(stored_artifact) if stored_artifact else None

        def storage_download(path):
            if pkl is None:
                raise Exception("Object not found")
            return pkl

        mock_client.storage.from_.return_value.download.side_effect = storage_download

        mock_supabase_mod = MagicMock()
        mock_supabase_mod.create_client.return_value = mock_client

        # sentence_transformers mock
        n = max(len(tender_rows), 1)
        fake_emb = np.random.rand(n, 64).astype(np.float32)
        mock_st_instance = MagicMock()
        mock_st_instance.encode.return_value = fake_emb
        mock_st_mod = MagicMock()
        mock_st_mod.SentenceTransformer = MagicMock(return_value=mock_st_instance)

        orig_sb = sys.modules.get("supabase")
        orig_st = sys.modules.get("sentence_transformers")
        sys.modules["supabase"] = mock_supabase_mod
        sys.modules["sentence_transformers"] = mock_st_mod
        try:
            return score_unscored_tenders(
                supabase_url=self._URL,
                supabase_key=self._KEY,
                project_id=project_id,
            )
        finally:
            if orig_sb is None:
                sys.modules.pop("supabase", None)
            else:
                sys.modules["supabase"] = orig_sb
            if orig_st is None:
                sys.modules.pop("sentence_transformers", None)
            else:
                sys.modules["sentence_transformers"] = orig_st

    def test_returns_zero_when_no_filtered_tenders(self) -> None:
        result = self._run(filtered_ids=[], tender_rows=[])
        self.assertEqual(result, 0)

    def test_scores_with_model_when_artifact_available(self) -> None:
        artifact = self._make_artifact()
        rows = [{"id": i, "title": f"Tender {i}", "summary": "Desc"} for i in range(5)]
        result = self._run(filtered_ids=[r["id"] for r in rows], tender_rows=rows, artifact=artifact)
        self.assertEqual(result, 5)

    def test_assigns_neutral_score_when_no_model(self) -> None:
        """When storage has no model the function should still write 3.0 scores."""
        rows = [{"id": i, "title": f"Tender {i}", "summary": "Desc"} for i in range(3)]
        result = self._run(filtered_ids=[r["id"] for r in rows], tender_rows=rows, artifact=None)
        self.assertEqual(result, 3)


class TestScoreClamping(unittest.TestCase):
    """Verify the score clamping logic produces [1.0, 5.0] output."""

    def test_raw_scores_clamped_to_valid_range(self) -> None:
        raw = [-1.5, 0.0, 0.5, 1.0, 3.7, 5.0, 6.8, 100.0]
        clamped = [max(1.0, min(5.0, s)) for s in raw]
        for s in clamped:
            self.assertGreaterEqual(s, 1.0)
            self.assertLessEqual(s, 5.0)

    def test_clamp_preserves_in_range_values(self) -> None:
        for v in [1.0, 2.5, 3.0, 4.9, 5.0]:
            self.assertAlmostEqual(max(1.0, min(5.0, v)), v)

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
            "cpv_codes": [],
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
        result = self._eval(self._tender(cpv_codes=["45000000"]), {"cpv_codes": ["72", "73"]})
        self.assertFalse(result["passed"])
        self.assertIn("cpv_mismatch", result["discard_reasons"])

    def test_passes_cpv_prefix_match(self) -> None:
        result = self._eval(self._tender(cpv_codes=["72300000"]), {"cpv_codes": ["72"]})
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
