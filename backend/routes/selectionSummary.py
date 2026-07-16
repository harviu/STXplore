from fastapi import APIRouter, HTTPException, Query

from backend.db.analytics import crime_analytics, normalize_feature_id


router = APIRouter(tags=["selection"])


@router.get("/selection-summary")
def selection_summary(  # type: ignore
    layer: str = Query(..., description="community | beat | district"),
    id: str = Query(..., description="Selected boundary id"),
    start: str = Query(..., description="YYYY-MM-DD (inclusive)"),
    end: str = Query(..., description="YYYY-MM-DD (exclusive)"),
):
    """Return total crimes and the top ten types for a selected boundary."""
    if layer not in {"community", "beat", "district"}:
        raise HTTPException(status_code=400, detail="Invalid layer (use community|beat|district)")
    feature_id = normalize_feature_id(layer, id)
    try:
        total, top_types = crime_analytics.selection_summary(
            layer, feature_id, start, end
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {
        "layer": layer,
        "id": feature_id,
        "start": start,
        "end": end,
        "total_crimes": total,
        "top_types": top_types,
    }
