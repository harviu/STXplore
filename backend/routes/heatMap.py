from fastapi import APIRouter, HTTPException, Query

from backend.db.analytics import crime_analytics


router = APIRouter(tags=["map"])
ALLOWED_LAYERS = {"community_area", "beat", "district"}


@router.get("/map/totals")
def map_totals(  # type: ignore
    layer: str = Query(..., description="community_area | beat | district"),
    start: str = Query(..., description="YYYY-MM-DD (inclusive)"),
    end: str = Query(..., description="YYYY-MM-DD (exclusive)"),
):
    """Return aggregate crime counts per boundary for a date range."""
    if layer not in ALLOWED_LAYERS:
        raise HTTPException(status_code=400, detail=f"Invalid layer '{layer}'")
    try:
        rows = crime_analytics.totals(layer, start, end)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if layer == "beat":
        for row in rows:
            row["feature_id"] = str(row["feature_id"]).zfill(4)
    return {"layer": layer, "start": start, "end": end, "data": rows}
