"""CLI entry point: train one relevance model per active project.

Usage:
    python -m pipeline.run_train
    python -m pipeline.run_train --csv-path data/historico_licitaciones.csv --models-dir models/
    python -m pipeline.run_train --publish

For each active project the script:
  1. Loads training data: shared historical CSV baseline + that project's
     human scores from Supabase (current training session only).
  2. Trains a sentence-transformer + Ridge regression model.
  3. Saves the artifact as ``models/scoring_<project_id>_v<YYYYMMDD>.pkl``.

With ``--publish`` all per-project artifacts are uploaded together to a single
``scoring-model-latest`` GitHub Release, replacing the previous release.

Projects with insufficient training data (fewer than ``--min-samples`` rows
after combining baseline + human scores) are skipped with a warning.
"""
from __future__ import annotations

import argparse
import logging
import os
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train one relevance model per active project"
    )
    parser.add_argument(
        "--csv-path",
        default="data/historico_licitaciones.csv",
        help="Path to the shared historical scored tenders CSV (baseline)",
    )
    parser.add_argument(
        "--models-dir",
        default="models",
        help="Directory where model artifacts are saved",
    )
    parser.add_argument(
        "--min-samples",
        type=int,
        default=5,
        help=(
            "Minimum number of training rows required to train a project model. "
            "Projects below this threshold are skipped."
        ),
    )
    parser.add_argument(
        "--publish",
        action="store_true",
        help=(
            "Publish all trained models as the 'scoring-model-latest' GitHub Release. "
            "Requires GITHUB_TOKEN and GITHUB_REPOSITORY environment variables "
            "(available automatically in GitHub Actions)."
        ),
    )
    parser.add_argument("--log-level", default="INFO", help="Log level")
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
    from pipeline.scoring.model_io import save_model, publish_model_release

    csv_path = Path(args.csv_path)
    models_dir = Path(args.models_dir)

    client = create_client(supabase_url, supabase_key)
    projects_resp = (
        client.table("projects")
        .select("id, name")
        .eq("is_active", True)
        .execute()
    )
    projects = projects_resp.data or []

    if not projects:
        raise SystemExit("No active projects found. Nothing to train.")

    log.info("Training models for %d active project(s)", len(projects))

    saved_paths: list[Path] = []
    results: list[dict] = []

    for proj in projects:
        project_id = proj["id"]
        project_name = proj.get("name", project_id)

        log.info("[%s] Loading dataset for project '%s'…", project_id, project_name)
        try:
            df = load_dataset_for_project(
                project_id=project_id,
                csv_path=csv_path,
                supabase_url=supabase_url,
                supabase_key=supabase_key,
            )
        except ValueError as exc:
            log.warning("[%s] Skipping — no training data: %s", project_id, exc)
            continue

        if len(df) < args.min_samples:
            log.warning(
                "[%s] Skipping — only %d training rows (minimum is %d).",
                project_id, len(df), args.min_samples,
            )
            continue

        log.info("[%s] Training on %d rows…", project_id, len(df))
        artifact = train(df)

        saved_path = save_model(artifact, models_dir, project_id)
        saved_paths.append(saved_path)

        results.append({
            "project_id": project_id,
            "project_name": project_name,
            "version": artifact["version"],
            "mae": round(artifact["mae"], 4),
            "dataset_size": len(df),
            "saved_to": str(saved_path),
        })
        log.info(
            "[%s] Done. version=%s, MAE=%.4f, rows=%d",
            project_id, artifact["version"], artifact["mae"], len(df),
        )

    if not saved_paths:
        raise SystemExit(
            "No models were trained. Check that projects have sufficient human scores."
        )

    if args.publish:
        github_token = os.environ.get("GITHUB_TOKEN")
        github_repo = os.environ.get("GITHUB_REPOSITORY")
        if not github_token or not github_repo:
            raise SystemExit(
                "--publish requires GITHUB_TOKEN and GITHUB_REPOSITORY environment variables."
            )
        publish_model_release(saved_paths, github_token=github_token, repo=github_repo)

    print("train_results", results)


if __name__ == "__main__":
    main()
