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
    """Perform an arbitrary slice of the 4D MI or SAGE tensor and return the result.

    This is a low-level general-purpose tensor slicing endpoint used for the
    cluster heatmap and hover tooltip time series in relation and instance modes.
    The tensor shape is (90, 77, 30, 77): (history_lag, source, horizon, target).
    All community indices are 0-based.

    The parameter naming (d1..d4, b1, b3) maps to tensor axes as follows:
        d1 / b1  →  axis 0: history_lag   (0 = most recent, 89 = oldest)
        d2       →  axis 1: source community (0-indexed, None = all)
        d3 / b3  →  axis 2: horizon day   (0 = D+1, 29 = D+30)
        d4       →  axis 3: target community (0-indexed, None = all)

    The boolean flags b1 and b3 change the slicing behavior for their axis:
        b1=False → slice up to d1 (loadedArray[:d1, ...] or scalar index)
        b1=True  → use the full axis 0 as a range (all history lags up to d1)
        b3=False → use d3 as a scalar index (single horizon)
        b3=True  → use d3_start:d3 as a range slice on the horizon axis

    When both b1=True and b3=True (the most common call from the frontend):
        - Slices history as [:, ...] and horizon as [d3_start:d3]
        - Aggregates: SAGE uses sum over the horizon window; MI uses mean
        - If d1 is set, further slices the result to [d1_start:d1] on the
          history axis of the aggregated output
        - This produces the 2D (community × time) array used by the cluster heatmap

    Normalization (normalize=True):
        - MI:   rescales to 0..100 using the full-tensor min/max as reference
        - SAGE: rescales to -100..100 using the full-tensor absolute max as reference
        Both are clipped to their respective ranges after scaling.

    Args:
        model: Model folder name under the models directory (e.g. "Transformer").
        data_mode: "mi" for Mutual Information tensor, "sage" for SAGE tensor.
        d1: Axis 0 (history_lag) bound. Meaning changes with b1.
        b1: If True, treat axis 0 as a full range rather than a scalar index.
        d2: Axis 1 (source community) index, 0-based. None = keep all sources.
        d3: Axis 2 (horizon) bound. Meaning changes with b3.
        b3: If True, treat axis 2 as a range [d3_start:d3] rather than scalar.
        d4: Axis 3 (target community) index, 0-based. None = keep all targets.
        d3_start: Start of the horizon range when b3=True. Defaults to 0.
        d1_start: Start of the history range for post-aggregation slicing. Defaults to 0.
        normalize: Whether to normalize output to 0–100 (MI) or -100–100 (SAGE) scale.

    Returns:
        A nested list (JSON array) of the sliced and optionally aggregated tensor values.
        Shape depends on which axes were fixed vs ranged, but typically:
        - [float, ...]           for a 1D community attribution vector
        - [[float, ...], ...]    for a 2D (community × time) heatmap matrix

    Raises:
        404: If the tensor file is not found for the given model/data_mode.
        422: If d2 or d4 are out of bounds (must be 0..76).
    """
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