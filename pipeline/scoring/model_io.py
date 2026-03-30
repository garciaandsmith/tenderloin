"""Per-project model artifact save/load via Supabase Storage.

Model files are stored in the ``models`` Supabase Storage bucket under
the path ``scoring_<project_id>.pkl``.  There is always at most one live
model per project — uploading overwrites the previous artifact.

The bucket must exist in Supabase before the retrain workflow runs.
Create it once via the Supabase dashboard or CLI:
    supabase storage create models --public=false
"""
from __future__ import annotations

import logging
import pickle

logger = logging.getLogger(__name__)

_BUCKET = "models"


def save_model(artifact: dict, client, project_id: str) -> None:
    """Serialize ``artifact`` and upload to Supabase Storage.

    Overwrites any previous model for the same project.
    Raises on storage errors so the retrain workflow fails loudly.
    """
    data = pickle.dumps(artifact, protocol=pickle.HIGHEST_PROTOCOL)
    path = f"scoring_{project_id}.pkl"

    # Auto-create the bucket on first run; silently ignore if it already exists.
    try:
        client.storage.create_bucket(_BUCKET, options={"public": False})
        logger.info("Created storage bucket '%s'", _BUCKET)
    except Exception:
        pass  # Bucket already exists — expected on every run after the first

    client.storage.from_(_BUCKET).upload(
        path,
        data,
        {"content-type": "application/octet-stream", "upsert": "true"},
    )
    logger.info(
        "[%s] Model (version=%s, MAE=%.3f) saved to storage://%s/%s",
        project_id, artifact.get("version", "?"), artifact.get("mae", float("nan")),
        _BUCKET, path,
    )


def load_model(client, project_id: str) -> dict | None:
    """Download and deserialize the model for ``project_id``.

    Returns ``None`` if no model has been trained yet (file not found),
    so callers can fall back to a neutral score gracefully.
    """
    path = f"scoring_{project_id}.pkl"
    try:
        data = client.storage.from_(_BUCKET).download(path)
        artifact = pickle.loads(data)  # noqa: S301 — internal artifact, not user-supplied
        logger.info(
            "[%s] Loaded model version=%s from storage://%s/%s",
            project_id, artifact.get("version", "?"), _BUCKET, path,
        )
        return artifact
    except Exception as exc:
        logger.info("[%s] No model in storage (%s) — will use neutral score.", project_id, exc)
        return None
