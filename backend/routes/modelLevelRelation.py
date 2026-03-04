from __future__ import annotations
import numpy as np
from fastapi import APIRouter, Query

router = APIRouter(tags=["Model Level Relation"])
file_path = "data/Chicago-Data/mi_result_io.npy"

loaded_array = np.load(file_path)
if loaded_array.ndim != 4 or loaded_array.shape != (90, 77, 30, 77):
    raise RuntimeError(f"Unexpected tensor shape: {loaded_array.shape}")

#Model level relation matrix (77x77)
MODEL_MATRIX = loaded_array.mean(axis=(0, 2)).astype(np.float32)

def normalize_row(v: np.ndarray) -> np.ndarray:
    v = v.astype(np.float32)
    v = v - float(v.min())
    s = float(v.sum())
    if s <= 0:
        return v
    return v / s

@router.get("/model_level_relation")
def model_relation( # type: ignore
    source: int = Query(..., ge=0, le=76, description="Tensor source index (0...76)"),
    normalize: bool = Query(True, description="Normalize row to sum to 1"),
):
    row = MODEL_MATRIX[source, :] # (77,)
    if normalize:
        row = normalize_row(row)
    return {"source": source, "targets": row.tolist(), "normalized": normalize} # type: ignore


# Instance-level map on source side: from 4D array, one value per source community (average over time).
# 4D shape (90, 77, 30, 77) = (source_time, source_community, target_time, target_community).
# Slice source_time by past_days (last N steps) and target_time by future_days (first N steps).


@router.get("/instance_level_source")
def instance_level_source(
    past_days: int = Query(90, ge=1, le=90, description="Source window: last N time steps"),
    future_days: int = Query(30, ge=1, le=30, description="Target window: first N time steps"),
):  # type: ignore
    """Per source community, time-averaged value from the 4D tensor over the given date range (for instance-level choropleth)."""
    # Source time: last past_days of 90 -> indices [90 - past_days, 90)
    s0 = max(0, 90 - past_days)
    # Target time: first future_days of 30 -> indices [0, future_days)
    t1 = min(30, future_days)
    sliced = loaded_array[s0:90, :, 0:t1, :]  # (past_days', 77, future_days', 77)
    values = sliced.mean(axis=(0, 2, 3)).astype(np.float32)  # (77,)
    data = [
        {"feature_id": str(j + 1), "count": float(values[j])}
        for j in range(77)
    ]
    return {"layer": "community_area", "data": data}  # type: ignore
