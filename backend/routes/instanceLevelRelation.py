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
    """Return instance-level MI attribution scores for a selected source community.

    Similar to /api/model_level_relation but scoped to a specific source
    community and slider window, making it instance-specific rather than
    a global model-level average. Slices the MI tensor to the given past and
    future window, then averages over those axes to return a 77-element vector
    of how much the selected source community relates to each target.

    The tensor shape is (90, 77, 30, 77): (history_lag, source, horizon, target).
    All community indices are 0-based (community 1 in the UI = index 0 here).

    This endpoint is used in Source → All Targets relationship mode to show the
    outgoing MI influence of a user-selected source community on the right map.

    Args:
        source: 0-based source community index (0..76).
        model: Model folder name under the models directory (e.g. "Transformer").
        past_start: Inclusive start index on the history lag axis.
        past_days: Exclusive end index on the history lag axis (slice: past_start:past_days).
        future_start: Inclusive start index on the horizon axis.
        future_days: Exclusive end index on the horizon axis (slice: future_start:future_days).

    Returns:
        {
            "source": int,
            "targets": [float, ...],   # 77 MI scores (0-indexed by community)
            "past_days": int,
            "future_days": int,
            "future_start": int,
            "model": str
        }

    Raises:
        404: If the MI tensor file is not found for the given model.
        422: If future_start >= future_days.
    """
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
    return {
        "source": source,
        "targets": row.tolist(),
        "past_days": past_days,
        "future_days": future_days,
        "future_start": future_start,
        "model": model,
    } # type: ignore