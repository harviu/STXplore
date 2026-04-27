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
    """Return day-by-day crime counts for every boundary feature, sourced from the database.

    Queries raw crime records from `crime_data` and groups them by boundary
    feature ID and calendar day. Returns one row per (feature, day) pair that
    had at least one crime. Used to build the source (past) cluster heatmap —
    where every community's daily crime pattern is needed simultaneously — and
    for the actual crime counts displayed on the right map in source mode.

    Note: This endpoint reads from the raw database. For data consistent with
    the model's training distribution use /api/selection-all-daily-csv instead.

    Args:
        layer: Boundary type — "community", "beat", or "district".
        start: Inclusive start date in YYYY-MM-DD format.
        end: Exclusive end date in YYYY-MM-DD format.

    Returns:
        {
            "layer": str,
            "start": str,
            "end": str,
            "daily": [
                {"id": str, "date": "YYYY-MM-DD", "count": int},
                ...   # ordered ascending by date, gaps omitted
            ]
        }

    Raises:
        400: If layer is not one of "community", "beat", or "district".
    """
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