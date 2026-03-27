from datetime import date
from pathlib import Path

import numpy as np

from backend.prediction.config import PRED_MODELS_DIR
from backend.prediction.runtime import RuntimeRegistry


def test_runtime_smoke_load_if_artifacts_present():
    if not PRED_MODELS_DIR.exists():
        return

    model_dirs = [p for p in PRED_MODELS_DIR.iterdir() if (p / "checkpoint" / "checkpoint.pth").exists()]
    if not model_dirs:
        return

    registry = RuntimeRegistry(models_dir=PRED_MODELS_DIR)
    bundle = registry.get(model_dirs[0].name)
    history = np.zeros((90, 77), dtype=np.float32)
    pred = bundle.predict(history, date(2025, 1, 31))

    assert pred.shape == (30, 77)
