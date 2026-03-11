"""Versioned model artifact save/load utilities."""
from __future__ import annotations

import logging
import pickle
import subprocess
from pathlib import Path

_RELEASE_TAG = "scoring-model-latest"
logger = logging.getLogger(__name__)


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


def publish_model_release(artifact_path: Path, github_token: str, repo: str) -> None:
    """Create or overwrite the ``scoring-model-latest`` GitHub Release with ``artifact_path``.

    Uses the ``gh`` CLI (pre-installed on GitHub Actions runners).
    ``repo`` should be ``"owner/repo"``, e.g. ``"garciaandsmith/tenderloin"``.
    """
    import os

    env = {**os.environ, "GITHUB_TOKEN": github_token}
    # Delete the tag + release if they already exist so we can recreate cleanly.
    subprocess.run(
        ["gh", "release", "delete", _RELEASE_TAG, "--repo", repo, "--yes", "--cleanup-tag"],
        env=env,
        capture_output=True,  # ignore "release not found" errors silently
    )
    result = subprocess.run(
        [
            "gh", "release", "create", _RELEASE_TAG,
            "--repo", repo,
            "--title", "Scoring model (latest)",
            "--notes", f"Auto-published by CI. Artifact: {artifact_path.name}",
            str(artifact_path),
        ],
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"gh release create failed:\n{result.stderr}")
    logger.info("Published model release %s to %s: %s", _RELEASE_TAG, repo, result.stdout.strip())


def download_model_release(models_dir: Path, github_token: str, repo: str) -> bool:
    """Download ``scoring_v*.pkl`` from the ``scoring-model-latest`` GitHub Release.

    Returns ``True`` if a file was downloaded, ``False`` if the release does not exist yet.
    Uses the ``gh`` CLI (pre-installed on GitHub Actions runners).
    """
    import os

    models_dir.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "GITHUB_TOKEN": github_token}
    result = subprocess.run(
        [
            "gh", "release", "download", _RELEASE_TAG,
            "--repo", repo,
            "--pattern", "scoring_v*.pkl",
            "--dir", str(models_dir),
        ],
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        logger.info("No model release found (%s). Will train from scratch.", result.stderr.strip())
        return False
    logger.info("Downloaded model artifact to %s", models_dir)
    return True
