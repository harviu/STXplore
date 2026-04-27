from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from backend.db.database import get_db

router = APIRouter(tags=["map"])
ALLOWED_LAYERS = {"community_area", "beat", "district"}

@router.get("/map/totals")
def map_totals(  # type: ignore
    layer: str = Query(..., description="community_area | beat | district"),
    start: str = Query(..., description="YYYY-MM-DD (inclusive)"),
    end: str = Query(..., description="YYYY-MM-DD (exclusive)"),
    db: Session = Depends(get_db),
):
    """Return total crime counts per boundary feature for a given date range, sourced from the database.

    Aggregates raw crime incident records from the `crime_data` table, grouping
    by the specified boundary layer. Used to color the left (past) map and right
    (actual) map polygons with real crime counts.

    The layer parameter is validated against a hard-coded allow-list before being
    interpolated into the SQL identifier, making it safe against injection. Beat
    IDs are zero-padded to 4 digits (e.g. "735" → "0735") to match the GeoJSON
    boundary feature IDs used by the frontend.

    Args:
        layer: Boundary grouping — "community_area", "beat", or "district".
        start: Inclusive start date in YYYY-MM-DD format.
        end: Exclusive end date in YYYY-MM-DD format.

    Returns:
        {
            "layer": str,
            "start": str,
            "end": str,
            "data": [{"feature_id": str, "count": int}, ...]
                     # one entry per boundary feature that had at least one crime
        }
    """
    # Layers are validated against a hard-coded allow-list 
    # So its safe to insert them into SQL identifiers
    if layer not in ALLOWED_LAYERS: return {"error": f"Invalid layer '{layer}'"}
    if layer == "beat":
        sql = text("""
            SELECT LPAD(beat::text, 4, '0') AS feature_id, COUNT(*)::int AS count
            FROM crime_data
            WHERE "date" >= :start AND "date" <  :end AND beat IS NOT NULL
            GROUP BY 1
            ORDER BY 1;
        """)
    else:
        sql = text(f"""
            SELECT {layer} AS feature_id, COUNT(*)::int AS count
            FROM crime_data
            WHERE "date" >= :start AND "date" <  :end AND {layer} IS NOT NULL
            GROUP BY {layer}
            ORDER BY {layer};
        """)
    rows = db.execute(sql, {"start": start, "end": end}).mappings().all()
    return {"layer": layer, "start": start, "end": end, "data": list(rows)}  # type: ignore