"""Train a tender affinity scoring model.

The model encodes tender text with a multilingual sentence-transformer, then
fits a Ridge regression to predict scores on the 1–5 scale.
"""
from __future__ import annotations

import logging
from datetime import date

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.model_selection import cross_val_score

logger = logging.getLogger(__name__)

_EMBEDDER_NAME = "paraphrase-multilingual-MiniLM-L12-v2"


def train(df: pd.DataFrame, embedder_name: str = _EMBEDDER_NAME) -> dict:
    """Fit a scoring model on ``df`` (columns: ``text``, ``score``).

    Returns a versioned artifact dict with keys:
    - ``embedder_name``: HuggingFace model name (not weights)
    - ``regressor``: fitted ``sklearn.linear_model.Ridge``
    - ``version``: ``YYYYMMDD`` string (today)
    - ``mae``: mean absolute error from 5-fold cross-validation
    """
    from sentence_transformers import SentenceTransformer

    logger.info("Loading sentence-transformer: %s", embedder_name)
    embedder = SentenceTransformer(embedder_name)

    texts = df["text"].tolist()
    scores = df["score"].values.astype(float)

    logger.info("Encoding %d texts…", len(texts))
    embeddings = embedder.encode(texts, show_progress_bar=True, batch_size=64)

    logger.info("Training Ridge regression…")
    regressor = Ridge(alpha=1.0)

    # Evaluate with 5-fold CV before fitting on full data
    cv_scores = cross_val_score(
        regressor, embeddings, scores, cv=5, scoring="neg_mean_absolute_error"
    )
    mae = float(-cv_scores.mean())
    logger.info("Cross-validation MAE: %.3f (±%.3f)", mae, cv_scores.std())

    regressor.fit(embeddings, scores)

    version = date.today().strftime("%Y%m%d")
    return {
        "embedder_name": embedder_name,
        "regressor": regressor,
        "version": version,
        "mae": mae,
    }
