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
    past_start: int = Query(0, ge=0, le=89),
    past_days: int = Query(90, ge=1, le=90),
    future_start: int = Query(0, ge=0, le=29),
    future_days: int = Query(30, ge=1, le=30),
):
    """Return model-level MI (Mutual Information) attribution scores for a source or target community.

    Slices the precomputed 4D MI tensor for the given model along the selected
    past and future windows, then averages over those axes to produce a 77-element
    vector of attribution scores — one per community.

    The tensor shape is (90, 77, 30, 77): (history_lag, source, horizon, target).
    All community indices are 0-based (community 1 in the UI = index 0 here).

    Exactly one of `source` or `target` must be provided:
    - Providing `target` returns a vector of how much each source community
      influenced the given target (All Sources → Target mode).
    - Providing `source` returns a vector of how much the given source community
      influences each target (Source → All Targets mode).

    The MI tensor is loaded from disk on first request and cached in memory for
    all subsequent requests. The cache key is the model name.

    Args:
        source: 0-based source community index (0..76). Mutually exclusive with target.
        target: 0-based target community index (0..76). Mutually exclusive with source.
        model: Model folder name under the models directory (e.g. "Transformer").
        past_start: Inclusive start index on the history axis (0 = most recent lag).
        past_days: Exclusive end index on the history axis (tensor slice: past_start:past_days).
        future_start: Inclusive start index on the horizon axis.
        future_days: Exclusive end index on the horizon axis.

    Returns:
        {
            "source": int | null,
            "target": int | null,
            "targets": [float, ...],   # 77 attribution scores (0-indexed by community)
            "model": str
        }

    Raises:
        404: If the MI tensor file is not found for the given model.
        422: If neither or both of source/target are provided, or if
             future_start >= future_days.
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

    sliced = arr[past_start:past_days, :, future_start:future_days, :]
    matrix = sliced.mean(axis=(0, 2)).astype(np.float32)
    row = matrix[source, :] if source is not None else matrix[:, target]
    return {"source": source, "target": target, "targets": row.tolist(), "model": model}