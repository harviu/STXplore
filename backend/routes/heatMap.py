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