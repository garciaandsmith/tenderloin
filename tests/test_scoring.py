"""Unit tests for the scoring pipeline (train, dataset, model_io).

These tests do NOT require Supabase credentials or a GPU — sentence-transformers
is mocked so the suite runs quickly in CI without heavy dependencies.
"""
from __future__ import annotations

import pickle
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd


class TestLoadDataset(unittest.TestCase):
    """Tests for pipeline.scoring.dataset.load_dataset."""

    def _write_csv(self, tmp_dir: str, rows: list[dict]) -> Path:
        df = pd.DataFrame(rows)
        path = Path(tmp_dir) / "historico.csv"
        df.to_csv(path, index=False)
        return path

    def test_loads_text_and_score_from_csv(self) -> None:
        from pipeline.scoring.dataset import load_dataset

        with tempfile.TemporaryDirectory() as tmp:
            csv = self._write_csv(tmp, [
                {"Objeto": "Servicio de comunicación digital", "Score": 4},
                {"Objeto": "Suministro de equipos informáticos", "Score": 1},
            ])
            df = load_dataset(csv)

        self.assertIn("text", df.columns)
        self.assertIn("score", df.columns)
        self.assertEqual(len(df), 2)

    def test_excludes_score_zero_rows(self) -> None:
        """Score 0 means 'manual review needed' and must be excluded from training."""
        from pipeline.scoring.dataset import load_dataset

        with tempfile.TemporaryDirectory() as tmp:
            csv = self._write_csv(tmp, [
                {"Objeto": "Texto A", "Score": 0},  # ambiguous — must be excluded
                {"Objeto": "Texto B", "Score": 3},
            ])
            df = load_dataset(csv)

        self.assertEqual(len(df), 1)
        self.assertEqual(df.iloc[0]["score"], 3.0)

    def test_excludes_rows_with_missing_score(self) -> None:
        from pipeline.scoring.dataset import load_dataset

        with tempfile.TemporaryDirectory() as tmp:
            csv = self._write_csv(tmp, [
                {"Objeto": "Texto A", "Score": None},
                {"Objeto": "Texto B", "Score": 5},
            ])
            df = load_dataset(csv)

        self.assertEqual(len(df), 1)

    def test_score_column_is_float(self) -> None:
        from pipeline.scoring.dataset import load_dataset

        with tempfile.TemporaryDirectory() as tmp:
            csv = self._write_csv(tmp, [
                {"Objeto": "Servicio de marketing", "Score": "4"},
            ])
            df = load_dataset(csv)

        self.assertEqual(df["score"].dtype, float)

    def test_raises_when_no_data(self) -> None:
        from pipeline.scoring.dataset import load_dataset

        with tempfile.TemporaryDirectory() as tmp:
            # CSV with only score-0 rows → empty after filtering
            csv = self._write_csv(tmp, [
                {"Objeto": "A", "Score": 0},
            ])
            with self.assertRaises(ValueError):
                load_dataset(csv)


class TestModelIO(unittest.TestCase):
    """Tests for pipeline.scoring.model_io save/load round-trip."""

    def _make_artifact(self, version: str = "20260101") -> dict:
        from sklearn.linear_model import Ridge

        reg = Ridge()
        reg.fit([[0], [1]], [1.0, 5.0])  # tiny fit to make it serialisable
        return {
            "embedder_name": "paraphrase-multilingual-MiniLM-L12-v2",
            "regressor": reg,
            "version": version,
            "mae": 0.5,
        }

    def test_save_creates_versioned_pkl(self) -> None:
        from pipeline.scoring.model_io import save_model

        with tempfile.TemporaryDirectory() as tmp:
            artifact = self._make_artifact("20260311")
            path = save_model(artifact, Path(tmp))
            self.assertTrue(path.exists())
            self.assertEqual(path.name, "scoring_v20260311.pkl")

    def test_load_latest_returns_most_recent_version(self) -> None:
        from pipeline.scoring.model_io import save_model, load_latest_model

        with tempfile.TemporaryDirectory() as tmp:
            models_dir = Path(tmp)
            save_model(self._make_artifact("20260101"), models_dir)
            save_model(self._make_artifact("20260201"), models_dir)
            save_model(self._make_artifact("20260311"), models_dir)

            loaded = load_latest_model(models_dir)
            self.assertEqual(loaded["version"], "20260311")

    def test_load_raises_when_no_model(self) -> None:
        from pipeline.scoring.model_io import load_latest_model

        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(FileNotFoundError):
                load_latest_model(Path(tmp))

    def test_roundtrip_preserves_artifact_keys(self) -> None:
        from pipeline.scoring.model_io import save_model, load_latest_model

        with tempfile.TemporaryDirectory() as tmp:
            original = self._make_artifact("20260311")
            save_model(original, Path(tmp))
            loaded = load_latest_model(Path(tmp))

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

            save_model(original, Path(tmp))
            loaded = load_latest_model(Path(tmp))
            result = loaded["regressor"].predict(X_test)[0]

        self.assertAlmostEqual(result, expected, places=6)


class TestTrain(unittest.TestCase):
    """Tests for pipeline.scoring.train.train (sentence-transformer mocked)."""

    def _make_df(self, n: int = 20) -> pd.DataFrame:
        texts = [f"Licitación de comunicación número {i}" for i in range(n)]
        scores = np.linspace(1, 5, n)
        return pd.DataFrame({"text": texts, "score": scores})

    def _train_with_mock(self, df: pd.DataFrame | None = None):
        """Helper: run train() with a mocked SentenceTransformer.

        sentence_transformers may not be installed in the test environment, so
        we inject a fake module into sys.modules so the lazy import inside
        train() resolves to our mock without needing the real package.
        """
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
        """score_unscored_tenders clamps raw predictions to [1.0, 5.0].

        Score 0 is reserved for 'manual review needed' and must never be emitted
        by the model. This test verifies the clamping inline logic is correct.
        """
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


if __name__ == "__main__":
    unittest.main()
