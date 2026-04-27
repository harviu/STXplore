from __future__ import annotations
import numpy as np
from fastapi import APIRouter, HTTPException, Query
from backend.prediction.config import PRED_MODELS_DIR

router = APIRouter(tags=["Value Bounds"])

_cache: dict[str, dict] = {}

@router.get("/value-bounds")
def value_bounds(model: str = Query(..., description="Model folder name (e.g. Transformer)")):
    """Return the global min and max values of the MI and SAGE tensors for a given model.

    Loads both the full MI and SAGE 4D tensors for the model and computes their
    global minimum and maximum values. These bounds are used by the frontend to
    build a consistent color scale anchored to the true data range rather than
    the range of whichever slice happens to be visible at a given moment.

    Both tensors are loaded fresh on first request and the result is cached in
    memory per model name. Subsequent requests for the same model return
    immediately from cache without re-reading disk.

    Args:
        model: Model folder name under the models directory (e.g. "Transformer").

    Returns:
        {
            "sage": {"min": float, "max": float},
            "mi":   {"min": float, "max": float}
        }

    Raises:
        404: If the SAGE or MI tensor file is not found for the given model.
    """
    if model in _cache:
        return _cache[model]

    sage_path = PRED_MODELS_DIR / model / "sage" / "sage_4d_history_source_horizon_target.npy"
    mi_path   = PRED_MODELS_DIR / model / "mi"   / "mi_input_output.npy"

    if not sage_path.exists():
        raise HTTPException(status_code=404, detail=f"SAGE file not found for model '{model}'")
    if not mi_path.exists():
        raise HTTPException(status_code=404, detail=f"MI file not found for model '{model}'")

    sage = np.load(sage_path)
    mi   = np.load(mi_path)

    result = {
        "sage": {"min": float(sage.min()), "max": float(sage.max())},
        "mi":   {"min": float(mi.min()),   "max": float(mi.max())},
    }
    _cache[model] = result
    return result