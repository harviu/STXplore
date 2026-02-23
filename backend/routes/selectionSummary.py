from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from backend.db.database import get_db

router = APIRouter(tags=["selection"])

@router.get("/selection-summary")
def selection_summary(  # type: ignore
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
    # Normalize beat id's: allow frontend to send "0735" but DB stores "735"
    if layer == "beat":
        try:
            id = str(int(id)) # "0735" -> "735"
        except Exception:
            id = id.lstrip("0") or "0"
    
    params = {"start": start, "end": end, "id": id}

    total_sql = text(f"""
        SELECT COUNT(*)::int AS total
        FROM crime_data
        WHERE "date" >= :start
          AND "date" <  :end
          AND {col} IS NOT NULL
          AND {col}::text = :id;
    """)

    top_sql = text(f"""
        SELECT primary_type, COUNT(*)::int AS count
        FROM crime_data
        WHERE "date" >= :start
          AND "date" <  :end
          AND {col} IS NOT NULL
          AND {col}::text = :id
        GROUP BY primary_type
        ORDER BY count DESC
        LIMIT 10;
    """)

    total = db.execute(total_sql, params).mappings().one()["total"]
    top_types = db.execute(top_sql, params).mappings().all()

    return {
        "layer": layer,
        "id": id,
        "start": start,
        "end": end,
        "total_crimes": total,
        "top_types": list(top_types),
    }  # type: ignore
