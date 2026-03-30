from __future__ import annotations
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


def _normalize_signed(row: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    """Normalize a row to [-100, 100] using the global abs-max of the full matrix.
    
    This preserves the sign and relative magnitude of SAGE values:
    - Positive values (source increases target crime) map to (0, 100]
    - Negative values (source suppresses target crime) map to [-100, 0)
    - Zero means no influence
    """
    abs_max = float(np.abs(matrix).max())
    if abs_max <= 0:
        return np.zeros_like(row, dtype=np.float32)
    return ((row / abs_max) * 100.0).astype(np.float32)


@router.get("/model_level_sage")
def model_level_sage(  # type: ignore
    source: int = Query(..., ge=0, le=76, description="Source community index (0...76)"),
    model: str = Query(..., description="Model folder name (e.g. Transformer)"),
    normalize: bool = Query(True, description="Normalize row to [-100, 100] using abs-max"),
):
    """Model-level SAGE attribution: average over all history lags and horizons.
    
    Returns how much each source community's past crime influences each target
    community's predicted future crime, according to this model's learned weights.
    Positive = amplifying effect, negative = suppressive effect.
    """
    try:
        arr = _load_array(model)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Average over history_lag (axis 0) and horizon (axis 2) -> (77, 77)
    matrix = arr.mean(axis=(0, 2)).astype(np.float32)
    row = matrix[source, :]

    if normalize:
        row = _normalize_signed(row, matrix)

    return {"source": source, "targets": row.tolist(), "normalized": normalize, "model": model}


@router.get("/instance_level_sage")
def instance_level_sage(  # type: ignore
    source: int = Query(..., ge=0, le=76, description="Source community index (0...76)"),
    model: str = Query(..., description="Model folder name (e.g. Transformer)"),
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
    sliced = arr[:past_days, :, future_start:future_days, :]
    # Average over time axes -> (77, 77) instance-specific matrix
    instance_matrix = sliced.mean(axis=(0, 2)).astype(np.float32)
    row = instance_matrix[source, :]
    row = _normalize_signed(row, instance_matrix)

    return {
        "source": source,
        "targets": row.tolist(),
        "normalized": True,
        "past_days": past_days,
        "future_days": future_days,
        "future_start": future_start,
        "model": model,
    }