import numpy as np
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from backend.prediction.config import PRED_MODELS_DIR

router = APIRouter(tags=["data4d"])

_cache: dict[str, np.ndarray] = {}

def _load_array(model: str, data_mode: str) -> np.ndarray:
    """Load and cache the 4D tensor for a given model and data mode.
    
    data_mode='mi'   -> models/<model>/mi/mi_input_output.npy
    data_mode='sage' -> models/<model>/sage/sage_4d_history_source_horizon_target.npy
    """
    cache_key = f"{model}_{data_mode}"
    if cache_key in _cache:
        return _cache[cache_key]
    if data_mode == "sage":
        path = PRED_MODELS_DIR / model / "sage" / "sage_4d_history_source_horizon_target.npy"
    else:
        path = PRED_MODELS_DIR / model / "mi" / "mi_input_output.npy"
    if not path.exists():
        raise FileNotFoundError(f"{data_mode.upper()} file not found for model '{model}': {path}")
    arr = np.load(path)
    if arr.ndim != 4 or arr.shape != (90, 77, 30, 77):
        raise RuntimeError(f"Unexpected tensor shape for model '{model}': {arr.shape}")
    _cache[cache_key] = arr
    return arr

@router.get("/data4d")
def get_data4d(
    model: str = Query(..., description="Model folder name (e.g. Transformer)"),
    data_mode: str = Query("mi", description="Data source: 'mi' or 'sage'"),
    d1: Optional[int] = Query(None),
    b1: bool = Query(False),
    d2: Optional[int] = Query(None),
    d3: Optional[int] = Query(None),
    b3: bool = Query(False),
    d4: Optional[int] = Query(None),
    d3_start: Optional[int] = Query(None, ge=0, le=29),
    d1_start: Optional[int] = Query(None, ge=0, le=89),
    normalize: bool = Query(False, description="Normalize output against full tensor (MI: 0-100, SAGE: -100-100)"),
):
    try:
        loadedArray = _load_array(model, data_mode)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Validate indices are in bounds before slicing (tensor axes are 0-indexed, size 77)
    if d2 is not None and not (0 <= d2 <= 76):
        raise HTTPException(status_code=422, detail=f"d2={d2} is out of bounds — must be 0..76 (0-indexed community id)")
    if d4 is not None and not (0 <= d4 <= 76):
        raise HTTPException(status_code=422, detail=f"d4={d4} is out of bounds — must be 0..76 (0-indexed community id)")

    s1 = d1 if d1 is not None else slice(None)
    s2 = d2 if d2 is not None else slice(None)
    s3 = d3 if d3 is not None else slice(None)
    s4 = d4 if d4 is not None else slice(None)

    if b1 and b3:
        lo = int(d3_start) if d3_start is not None else 0
        sliced = loadedArray[:, s2, lo:s3, s4]
    elif b1:
        sliced = loadedArray[:s1, s2, s3-1, s4]
    elif b3:
        lo = int(d3_start) if d3_start is not None else 0
        sliced = loadedArray[s1, s2, lo:s3, s4]
    else:
        sliced = loadedArray[s1, s2, s3, s4]

    result = sliced.T if b1 else sliced
    if b1 and b3:
        # For SAGE, use sum over the selected horizon window; MI remains mean.
        result = np.sum(result, axis=0) if data_mode == "sage" else np.mean(result, axis=0)
        if d1 is not None:
            hi = int(d1)
            lo1 = int(d1_start) if d1_start is not None else 0
            if result.ndim == 2:
                result = result[:, lo1:hi]
            else:
                result = result[lo1:hi]
    if normalize:
        ref_matrix = loadedArray.sum(axis=(0, 2)) if data_mode == "sage" else loadedArray.mean(axis=(0, 2))
        if data_mode == "sage":
            abs_max = float(np.abs(ref_matrix).max())
            result = (result / abs_max * 100.0) if abs_max > 0 else result
        else:
            g_min = float(ref_matrix.min())
            g_max = float(ref_matrix.max())
            g_range = g_max - g_min
            result = ((result - g_min) / g_range * 100.0) if g_range > 0 else result
    if normalize:
        result = np.clip(result, -100.0, 100.0) if data_mode == "sage" else np.clip(result, 0.0, 100.0)
    return result.tolist() if isinstance(result, np.ndarray) else np.array(result).tolist()