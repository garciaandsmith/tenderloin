"""Versioned model artifact save/load utilities."""
from __future__ import annotations

import pickle
from pathlib import Path


def save_model(artifact: dict, models_dir: Path) -> Path:
    """Persist ``artifact`` to ``models/scoring_v<version>.pkl``.

    Returns the path of the saved file.
    """
    models_dir.mkdir(parents=True, exist_ok=True)
    version = artifact["version"]
    path = models_dir / f"scoring_v{version}.pkl"
    with open(path, "wb") as fh:
        pickle.dump(artifact, fh, protocol=pickle.HIGHEST_PROTOCOL)
    return path


def load_latest_model(models_dir: Path) -> dict:
    """Load the model artifact with the highest version string from ``models_dir``.

    Version strings are ``YYYYMMDD`` so lexicographic sort equals chronological sort.

    Raises ``FileNotFoundError`` if no model file exists.
    """
    candidates = sorted(models_dir.glob("scoring_v*.pkl"))
    if not candidates:
        raise FileNotFoundError(
            f"No model artifacts found in {models_dir}. "
            "Run 'python pipeline/run_train.py' first."
        )
    path = candidates[-1]
    with open(path, "rb") as fh:
        return pickle.load(fh)  # noqa: S301 — internal artifact, not user-supplied
