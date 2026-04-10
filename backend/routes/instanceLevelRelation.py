from __future__ import annotations
import numpy as np
from fastapi import APIRouter, HTTPException, Query
from backend.prediction.config import PRED_MODELS_DIR

router = APIRouter(tags=["Instance Level Relation"])

_cache: dict[str, np.ndarray] = {}

def _load_array(model: str) -> np.ndarray:
    if model in _cache:
        return _cache[model]
    path = PRED_MODELS_DIR / model / "mi" / "mi_input_output.npy"
    if not path.exists():
        raise FileNotFoundError(f"MI file not found for model '{model}': {path}")
    arr = np.load(path)
    if arr.ndim != 4 or arr.shape != (90, 77, 30, 77):
        raise RuntimeError(f"Unexpected tensor shape for model '{model}': {arr.shape}")
    _cache[model] = arr
    return arr

@router.get("/instance_level_relation")
def instance_relation(  # type: ignore
    source: int = Query(..., ge=0, le=76, description="Source community index (0...76)"),
    model: str = Query(..., description="Model folder name (e.g. Transformer)"),
    past_start: int = Query(0, ge=0, le=89, description="Inclusive start index on past axis (0...89)"),
    past_days: int = Query(..., ge=1, le=90, description="Past-day window driven by slider (1...90)"),
    future_days: int = Query(..., ge=1, le=30, description="Exclusive end index on future axis (1...30)"),
    future_start: int = Query(0, ge=0, le=29, description="Inclusive start index on future axis (0...29)"),
):
    if future_start >= future_days:
        raise HTTPException(status_code=422, detail="future_start must be less than future_days")
    try:
        arr = _load_array(model)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    sliced = arr[past_start:past_days, :, future_start:future_days, :]
    instance_matrix = sliced.mean(axis=(0, 2)).astype(np.float32)
    row = instance_matrix[source, :]
    g_min = float(instance_matrix.min())
    g_max = float(instance_matrix.max())
    g_range = g_max - g_min
    normalized = np.zeros(77, dtype=np.float32) if g_range <= 0 else ((row - g_min) / g_range) * 100.0
    return {
        "source": source,
        "targets": normalized.tolist(),
        "normalized": True,
        "past_days": past_days,
        "future_days": future_days,
        "future_start": future_start,
        "model": model,
    } # type: ignore