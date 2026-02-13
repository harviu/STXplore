from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from backend.db.database import get_db

router = APIRouter(tags=["map"])

@router.get("/map/counts")
def map_counts( # type: ignore
    start: str = Query(..., description="YYYY-MM-DD (inclusive)"),
    end: str = Query(..., description="YYYY-MM-DD (exclusive)"),
    db: Session = Depends(get_db),
 ) :
    sql = text("""
        SELECT
          community_area,
          COUNT(*)::int AS count
        FROM crime_data
        WHERE "date" >= :start
          AND "date" <  :end
          AND community_area IS NOT NULL
        GROUP BY community_area
        ORDER BY community_area;
    """)

    rows = db.execute(sql, {"start": start, "end": end}).mappings().all()
    return {"start": start, "end": end, "data": list(rows)}  # type: ignore
