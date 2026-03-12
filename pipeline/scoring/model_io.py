"""Versioned, per-project model artifact save/load utilities.

Model filenames follow the pattern:
    scoring_<project_id>_v<YYYYMMDD>.pkl

All per-project models are published together under a single GitHub Release
tag (``scoring-model-latest``).  The download helper retrieves only the files
matching a given project's pattern so the runner only pays for what it needs.
"""
from __future__ import annotations

import logging
import pickle
import subprocess
from pathlib import Path

_RELEASE_TAG = "scoring-model-latest"
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Save / load
# ---------------------------------------------------------------------------

def save_model(artifact: dict, models_dir: Path, project_id: str) -> Path:
    """Persist ``artifact`` to ``models/scoring_<project_id>_v<version>.pkl``.

    Returns the path of the saved file.
    """
    models_dir.mkdir(parents=True, exist_ok=True)
    version = artifact["version"]
    path = models_dir / f"scoring_{project_id}_v{version}.pkl"
    with open(path, "wb") as fh:
        pickle.dump(artifact, fh, protocol=pickle.HIGHEST_PROTOCOL)
    logger.info("Saved model for project %s → %s", project_id, path)
    return path


def load_latest_model(models_dir: Path, project_id: str) -> dict:
    """Load the most recent model artifact for ``project_id`` from ``models_dir``.

    Version strings are ``YYYYMMDD`` so lexicographic sort equals chronological
    sort.

    Raises ``FileNotFoundError`` if no model file for the project exists.
    """
    candidates = sorted(models_dir.glob(f"scoring_{project_id}_v????????.pkl"))
    if not candidates:
        raise FileNotFoundError(
            f"No model artifact found for project {project_id} in {models_dir}. "
            "Run 'python -m pipeline.run_train' first."
        )
    path = candidates[-1]
    with open(path, "rb") as fh:
        return pickle.load(fh)  # noqa: S301 — internal artifact, not user-supplied


def list_project_ids_with_models(models_dir: Path) -> list[str]:
    """Return the list of project IDs that have at least one model artifact."""
    seen: set[str] = set()
    for p in models_dir.glob("scoring_*_v????????.pkl"):
        # filename stem: "scoring_<project_id>_v<YYYYMMDD>"
        stem = p.stem
        without_prefix = stem[len("scoring_"):]      # "<project_id>_v<YYYYMMDD>"
        project_id = without_prefix.rsplit("_v", 1)[0]
        seen.add(project_id)
    return sorted(seen)


# ---------------------------------------------------------------------------
# GitHub Release publish / download
# ---------------------------------------------------------------------------

def publish_model_release(
    artifact_paths: list[Path],
    github_token: str,
    repo: str,
) -> None:
    """Create or overwrite the ``scoring-model-latest`` GitHub Release.

    Uploads all files in ``artifact_paths`` (one per project).
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

    file_args = [str(p) for p in artifact_paths]
    names = ", ".join(p.name for p in artifact_paths)
    result = subprocess.run(
        [
            "gh", "release", "create", _RELEASE_TAG,
            "--repo", repo,
            "--title", "Scoring models (latest)",
            "--notes", f"Auto-published by CI. Artifacts: {names}",
            *file_args,
        ],
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"gh release create failed:\n{result.stderr}")
    logger.info("Published model release %s to %s", _RELEASE_TAG, repo)


def download_all_project_models(
    models_dir: Path,
    github_token: str,
    repo: str,
) -> bool:
    """Download all per-project model artifacts from the GitHub Release.

    Returns ``True`` if at least one file was downloaded, ``False`` if the
    release does not exist yet.
    """
    import os

    models_dir.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "GITHUB_TOKEN": github_token}
    result = subprocess.run(
        [
            "gh", "release", "download", _RELEASE_TAG,
            "--repo", repo,
            "--pattern", "scoring_*_v????????.pkl",
            "--dir", str(models_dir),
            "--clobber",
        ],
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        logger.info("No model release found (%s).", result.stderr.strip())
        return False
    logger.info("Downloaded all model artifacts to %s", models_dir)
    return True
