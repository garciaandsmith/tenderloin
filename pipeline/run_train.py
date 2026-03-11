"""CLI entry point: train the tender affinity scoring model.

Usage:
    python -m pipeline.run_train
    python -m pipeline.run_train --csv-path data/historico_licitaciones.csv --models-dir models/

The script loads the historical CSV (and optionally Supabase human scores),
trains a sentence-transformer + Ridge regression model, and saves a versioned
artifact to the models directory.
"""
from __future__ import annotations

import argparse
import logging
import os
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the tender affinity scoring model")
    parser.add_argument(
        "--csv-path",
        default="data/historico_licitaciones.csv",
        help="Path to the historical scored tenders CSV",
    )
    parser.add_argument(
        "--models-dir",
        default="models",
        help="Directory where model artifacts are saved",
    )
    parser.add_argument("--log-level", default="INFO", help="Log level")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

    from pipeline.scoring.dataset import load_dataset
    from pipeline.scoring.train import train
    from pipeline.scoring.model_io import save_model

    csv_path = Path(args.csv_path)
    models_dir = Path(args.models_dir)

    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    logging.getLogger(__name__).info("Loading dataset from %s", csv_path)
    df = load_dataset(csv_path, supabase_url=supabase_url, supabase_key=supabase_key)
    logging.getLogger(__name__).info("Dataset size: %d rows", len(df))

    artifact = train(df)

    saved_path = save_model(artifact, models_dir)
    print(
        "train_result",
        {
            "version": artifact["version"],
            "mae": round(artifact["mae"], 4),
            "dataset_size": len(df),
            "saved_to": str(saved_path),
        },
    )


if __name__ == "__main__":
    main()
