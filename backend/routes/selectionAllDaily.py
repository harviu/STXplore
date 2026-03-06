from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from backend.db.database import get_db

router = APIRouter(tags=["selection"])

@router.get("/selection-all-daily")
def selection_all_daily(  # type: ignore
    layer: str = Query(..., description="community | beat | district"),
    id: str = Query(..., description="Selected boundary id (string or number)"),
    start: str = Query(..., description="YYYY-MM-DD (inclusive)"),
    end: str = Query(..., description="YYYY-MM-DD (exclusive)"),
    db: Session = Depends(get_db),
):
    col_map = {
        "community": "community_area",
        "beat": "beat",
        "district": "district",
    }
    col = col_map.get(layer)
    if not col:
        raise HTTPException(status_code=400, detail="Invalid layer (use community|beat|district)")

    # Normalize beat id's
    if layer == "beat":
        try:
            id = str(int(id))
        except Exception:
            id = id.lstrip("0") or "0"

    params = {"start": start, "end": end, "id": id}

    daily_sql = text(f"""
        SELECT
          date_trunc('day', "date")::date AS day,
          COUNT(*)::int AS count
        FROM crime_data
        WHERE "date" >= :start
          AND "date" <  :end
          AND {col} IS NOT NULL
        GROUP BY id, day
        ORDER BY day ASC;
    """)

    rows = db.execute(daily_sql, params).mappings().all()

    return {
        "layer": layer,
        "id": id,
        "start": start,
        "end": end,
        "daily": [{"date": str(r["day"]), "count": r["count"]} for r in rows],
    }  # type: ignore