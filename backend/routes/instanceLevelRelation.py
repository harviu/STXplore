from __future__ import annotations
import numpy as np
from fastapi import APIRouter, Query

router = APIRouter(tags=["Instance Level Relation"])
file_path = "data/Chicago-Data/mi_result_io.npy"
loaded_array = np.load(file_path)

if loaded_array.ndim != 4 or loaded_array.shape != (90, 77, 30, 77):
    raise RuntimeError(f"Unexpected tensor shape: {loaded_array.shape}")

@router.get("/instance_level_relation")
def instance_relation( # type: ignore
    source: int = Query(..., ge=0, le=76, description="Source community index (0...76)"),
    past_days: int = Query(..., ge=1, le=90, description="Past-day window driven by slider (1...90"),
    future_days: int = Query(..., ge=1, le=30, description="Future-day window driven by time slider (1...30"),
) :
    #Slice to the anchor-date window. This is what makes it "instance level"
    # Full tensor : (90, 77, 30, 77) -> sliced: (past_days, 77, future_days, 77)
    sliced = loaded_array[:past_days, :, :future_days, :]
    # Average over the two time axes -> (77, 77) instance specific relation matrix
    instance_matrix = sliced.mean(axis=(0, 2)).astype(np.float32)
    row = instance_matrix[source, :] # (77,)
    # Normalize 0-100 using min/max of THIS instance's full 77x77 matrix
    g_min = float(instance_matrix.min())
    g_max = float(instance_matrix.max())
    g_range = g_max - g_min
    if g_range <= 0:
        normalized = np.zeros(77, dtype=np.float32)
    else:
        normalized = ((row - g_min) / g_range) * 100.0
    return {
        "source": source,
        "targets": normalized.tolist(),
        "normalized": True,
        "past_days": past_days,
        "future_days": future_days,
    } # type: ignore