"""CLI entry point: train one scoring model per active project and save to Supabase Storage.

Triggered automatically by the retrain.yml GitHub Actions workflow when a user
submits a training label.  Can also be run manually.

For each active project:
  1. Load human-labeled training data from Supabase (current training session).
  2. If ≥ min_samples rows: fit sentence-transformer + Ridge regression.
  3. Save the artifact to Supabase Storage (models/scoring_<project_id>.pkl).

Projects with fewer than min_samples labeled tenders are skipped — scoring
will fall back to neutral 3.0 until more labels are added.

Requires:
  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.
"""
from __future__ import annotations

import argparse
import logging
import os


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train one scoring model per active project and save to Supabase Storage"
    )
    parser.add_argument(
        "--min-samples",
        type=int,
        default=5,
        help="Minimum labeled rows required to train a model (default: 5)",
    )
    parser.add_argument(
        "--project-id",
        default=None,
        help="Train only this project UUID (default: all active projects)",
    )
    parser.add_argument("--log-level", default="INFO")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )
    log = logging.getLogger(__name__)

    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not supabase_key:
        raise SystemExit(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required."
        )

    from supabase import create_client
    from pipeline.scoring.dataset import load_dataset_for_project
    from pipeline.scoring.train import train
    from pipeline.scoring.model_io import save_model

    client = create_client(supabase_url, supabase_key)

    projects_resp = (
        client.table("projects").select("id, name").eq("is_active", True).execute()
    )
    projects = projects_resp.data or []

    if not projects:
        raise SystemExit("No active projects found. Nothing to train.")

    if args.project_id:
        projects = [p for p in projects if p["id"] == args.project_id]
        if not projects:
            raise SystemExit(f"Project {args.project_id!r} not found or not active.")
        log.info("Training model for project: %s", args.project_id)

    log.info("Training models for %d active project(s)", len(projects))

    trained: list[str] = []

    for proj in projects:
        project_id = proj["id"]
        project_name = proj.get("name", project_id)

        log.info("[%s] Loading dataset for '%s'…", project_id, project_name)
        try:
            df = load_dataset_for_project(
                project_id=project_id,
                supabase_url=supabase_url,
                supabase_key=supabase_key,
            )
        except ValueError as exc:
            log.warning("[%s] Skipping — no training data: %s", project_id, exc)
            continue

        if len(df) < args.min_samples:
            log.warning(
                "[%s] Skipping — only %d rows (need %d).",
                project_id, len(df), args.min_samples,
            )
            continue

        log.info("[%s] Training on %d rows…", project_id, len(df))
        artifact = train(df)

        save_model(artifact, client, project_id)
        trained.append(project_id)

        log.info(
            "[%s] Done. version=%s, MAE=%.4f, rows=%d",
            project_id, artifact["version"], artifact["mae"], len(df),
        )

    if not trained:
        raise SystemExit(
            "No models were trained. Check that projects have at least "
            f"{args.min_samples} human-labeled tenders."
        )

    print(f"train_result: {{trained_projects: {trained}}}")


if __name__ == "__main__":
    main()
