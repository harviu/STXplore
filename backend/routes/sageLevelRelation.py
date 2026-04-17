from __future__ import annotations
from typing import Optional
import numpy as np
from fastapi import APIRouter, HTTPException, Query
from backend.prediction.config import PRED_MODELS_DIR

router = APIRouter(tags=["SAGE Level Relation"])

# Cache loaded arrays per model to avoid re-reading from disk on every request
_cache: dict[str, np.ndarray] = {}


def _load_array(model: str) -> np.ndarray:
    """Load and cache the SAGE 4D tensor for a given model.
    
    SAGE values are signed floats — positive values indicate the source community's
    past crime increases predicted crime in the target community; negative values
    indicate a suppressive effect. This is unlike MI which is always non-negative.
    
    Tensor axes: (history_lag, source_community, horizon, target_community)
    Shape: (90, 77, 30, 77)
    """
    if model in _cache:
        return _cache[model]
    path = PRED_MODELS_DIR / model / "sage" / "sage_4d_history_source_horizon_target.npy"
    if not path.exists():
        raise FileNotFoundError(f"SAGE file not found for model '{model}': {path}")
    arr = np.load(path)
    if arr.ndim != 4 or arr.shape != (90, 77, 30, 77):
        raise RuntimeError(f"Unexpected SAGE tensor shape for model '{model}': {arr.shape}")
    _cache[model] = arr
    return arr


@router.get("/model_level_sage")
def model_level_sage(  # type: ignore
    source: Optional[int] = Query(None, ge=0, le=76, description="Source community index (0...76)"),
    target: Optional[int] = Query(None, ge=0, le=76, description="Target community index (0...76)"),
    model: str = Query(..., description="Model folder name (e.g. Transformer)"),
    past_start: int = Query(0, ge=0, le=89),
    past_days: int = Query(90, ge=1, le=90),
    future_start: int = Query(0, ge=0, le=29),
    future_days: int = Query(30, ge=1, le=30),
):
    """Model-level SAGE attribution: sum over all selected history lags and horizons.
    
    Returns how much each source community's past crime influences each target
    community's predicted future crime, according to this model's learned weights.
    Positive = amplifying effect, negative = suppressive effect.
    """
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
    
    # Sum over history_lag (axis 0) and horizon (axis 2) -> (77, 77)
    sliced = arr[past_start:past_days, :, future_start:future_days, :]
    matrix = sliced.sum(axis=(0, 2)).astype(np.float32)
    row = matrix[source, :] if source is not None else matrix[:, target]

    return {"source": source, "targets": row.tolist(), "model": model}


@router.get("/instance_level_sage")
def instance_level_sage(  # type: ignore
    source: int = Query(..., ge=0, le=76, description="Source community index (0...76)"),
    model: str = Query(..., description="Model folder name (e.g. Transformer)"),
    past_start: int = Query(0, ge=0, le=89, description="Inclusive start index on past axis (0...89)"),
    past_days: int = Query(..., ge=1, le=90, description="Past-day window driven by slider (1...90)"),
    future_days: int = Query(..., ge=1, le=30, description="Exclusive end index on future axis (1...30)"),
    future_start: int = Query(0, ge=0, le=29, description="Inclusive start index on future axis (0...29)"),
):
    """Instance-level SAGE attribution: sliced by slider window.
    
    Same as model-level but restricted to the selected history and horizon window.
    Positive values = source amplifies target crime prediction.
    Negative values = source suppresses target crime prediction.
    """
    if future_start >= future_days:
        raise HTTPException(status_code=422, detail="future_start must be less than future_days")
    try:
        arr = _load_array(model)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Slice to slider window: (past_days, 77, future_slice, 77)
    sliced = arr[past_start:past_days, :, future_start:future_days, :]
    # Sum over time axes -> (77, 77) instance-specific matrix
    instance_matrix = sliced.sum(axis=(0, 2)).astype(np.float32)
    row = instance_matrix[source, :]

    return {
        "source": source,
        "targets": row.tolist(),
        "past_days": past_days,
        "future_days": future_days,
        "future_start": future_start,
        "model": model,
    }