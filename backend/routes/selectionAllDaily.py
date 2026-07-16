from fastapi import APIRouter, HTTPException, Query

from backend.db.analytics import crime_analytics


router = APIRouter(tags=["selection"])


@router.get("/selection-all-daily")
def selection_all_daily(  # type: ignore
    layer: str = Query(..., description="community | beat | district"),
    start: str = Query(..., description="YYYY-MM-DD (inclusive)"),
    end: str = Query(..., description="YYYY-MM-DD (exclusive)"),
):
    """Return daily crime counts for every feature in a boundary layer."""
    if layer not in {"community", "beat", "district"}:
        raise HTTPException(status_code=400, detail="Invalid layer (use community|beat|district)")
    try:
        rows = crime_analytics.all_daily(layer, start, end)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"layer": layer, "start": start, "end": end, "daily": rows}
