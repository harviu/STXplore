from __future__ import annotations

import os
from pathlib import Path

import torch


ROOT_DIR = Path(__file__).resolve().parents[2]

PRED_MODELS_DIR = Path(
    os.getenv("PRED_MODELS_DIR", ROOT_DIR / "models")
).expanduser().resolve()

PRED_DATA_FALLBACK_CSV = Path(
    os.getenv(
        "PRED_DATA_FALLBACK_CSV",
        ROOT_DIR / "data" / "Chicago-Data" / "Crime" / "crime_1_day_pivot.csv",
    )
).expanduser().resolve()

PRED_DEVICE = os.getenv("PRED_DEVICE", "auto").strip().lower()

COMMUNITY_IDS = tuple(range(1, 78))
SEQ_LEN = 90
PRED_LEN = 30
LABEL_LEN = 45


def resolve_device() -> torch.device:
    if PRED_DEVICE in {"cuda", "gpu"}:
        if not torch.cuda.is_available():
            raise RuntimeError("PRED_DEVICE requests CUDA, but CUDA is unavailable")
        return torch.device("cuda")
    if PRED_DEVICE == "cpu":
        return torch.device("cpu")
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")
