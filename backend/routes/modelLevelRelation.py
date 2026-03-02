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
# "community_source, average time" = for each source community, mean over all time and target.
INSTANCE_SOURCE_VALUES = loaded_array.mean(axis=(0, 2, 3)).astype(np.float32)  # (77,)


@router.get("/instance_level_source")
def instance_level_source():  # type: ignore
    """Per source community, time-averaged value from the 4D tensor (for instance-level choropleth)."""
    data = [
        {"feature_id": str(j + 1), "count": float(INSTANCE_SOURCE_VALUES[j])}
        for j in range(77)
    ]
    return {"layer": "community_area", "data": data}  # type: ignore
