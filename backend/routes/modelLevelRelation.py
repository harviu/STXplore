import numpy as np
from fastapi import APIRouter, HTTPException, Query
from backend.prediction.config import PRED_MODELS_DIR
from typing import Optional

router = APIRouter(tags=["Model Level Relation"])

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

@router.get("/model_level_relation")
def model_relation(
    source: Optional[int] = Query(None, ge=0, le=76),
    target: Optional[int] = Query(None, ge=0, le=76),
    model: str = Query(...),
    normalize: bool = Query(True),
    past_start: int = Query(0, ge=0, le=89),
    past_days: int = Query(90, ge=1, le=90),
    future_start: int = Query(0, ge=0, le=29),
    future_days: int = Query(30, ge=1, le=30),
):
    if source is None and target is None:
        raise HTTPException(status_code=422, detail="Either source or target must be provided.")
    if future_start >= future_days:
        raise HTTPException(status_code=422, detail="future_start must be less than future_days")
    try:
        arr = _load_array(model)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    sliced = arr[past_start:past_days, :, future_start:future_days, :]
    matrix = sliced.mean(axis=(0, 2)).astype(np.float32)
    row = matrix[source, :] if source is not None else matrix[:, target]
    if normalize:
        g_min = float(matrix.min())
        g_max = float(matrix.max())
        g_range = g_max - g_min
        row = np.zeros(77, dtype=np.float32) if g_range <= 0 else ((row - g_min) / g_range) * 100.0
    return {"source": source, "target": target, "targets": row.tolist(), "normalized": normalize, "model": model}