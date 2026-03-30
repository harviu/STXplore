from __future__ import annotations
import numpy as np
from fastapi import APIRouter, HTTPException, Query
from backend.prediction.config import PRED_MODELS_DIR

router = APIRouter(tags=["Model Level Relation"])

_cache: dict[str, np.ndarray] = {}

def _load_model_matrix(model: str) -> np.ndarray:
    if model in _cache:
        return _cache[model]
    path = PRED_MODELS_DIR / model / "mi" / "mi_input_output.npy"
    if not path.exists():
        raise FileNotFoundError(f"MI file not found for model '{model}': {path}")
    arr = np.load(path)
    if arr.ndim != 4 or arr.shape != (90, 77, 30, 77):
        raise RuntimeError(f"Unexpected tensor shape for model '{model}': {arr.shape}")
    matrix = arr.mean(axis=(0, 2)).astype(np.float32)
    _cache[model] = matrix
    return matrix

@router.get("/model_level_relation")
def model_relation(  # type: ignore
    source: int = Query(..., ge=0, le=76, description="Tensor source index (0...76)"),
    model: str = Query(..., description="Model folder name (e.g. Transformer)"),
    normalize: bool = Query(True, description="Normalize row to 0-100"),
):
    try:
        matrix = _load_model_matrix(model)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    row = matrix[source, :]
    if normalize:
        g_min = float(matrix.min())
        g_max = float(matrix.max())
        g_range = g_max - g_min
        row = np.zeros(77, dtype=np.float32) if g_range <= 0 else ((row - g_min) / g_range) * 100.0
    return {"source": source, "targets": row.tolist(), "normalized": normalize, "model": model} # type: ignore