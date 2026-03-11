from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from backend.db.database import get_db

router = APIRouter(tags=["selection"])

@router.get("/selection-all-daily")
def selection_all_daily(  # type: ignore
    layer: str = Query(..., description="community | beat | district"),
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

    params = {"start": start, "end": end}

    total_sql = text(f"""
        SELECT
          {col}::text AS id,
          date_trunc('day', "date")::date AS day,
          COUNT(*)::int AS count
        FROM crime_data
        WHERE "date" >= :start
          AND "date" <  :end
          AND {col} IS NOT NULL
        GROUP BY {col}::text, day
        ORDER BY day ASC;
    """)

    rows = db.execute(total_sql, params).mappings().all()

    return {
        "layer": layer,
        "start": start,
        "end": end,
        "daily": [{"id": r["id"], "date": str(r["day"]), "count": r["count"]} for r in rows],
    }  # type: ignore