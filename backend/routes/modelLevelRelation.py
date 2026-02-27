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
