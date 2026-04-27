from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from backend.db.database import get_db

router = APIRouter(tags=["selection"])

@router.get("/selection-daily")
def selection_daily(  # type: ignore
    layer: str = Query(..., description="community | beat | district"),
    id: str = Query(..., description="Selected boundary id (string or number)"),
    start: str = Query(..., description="YYYY-MM-DD (inclusive)"),
    end: str = Query(..., description="YYYY-MM-DD (exclusive)"),
    db: Session = Depends(get_db),
):
    """Return a crime summary for a single selected boundary, sourced from the database.

    Computes the total crime count and the top 10 crime types (by frequency)
    for the specified boundary feature over the given date range. Used by the
    right side panel to populate the crime summary block when the user clicks
    a community, beat, or district on either map.

    Beat IDs are normalized before querying: the frontend may send zero-padded
    strings like "0735" but the database stores them as "735", so leading zeros
    are stripped on the way in.

    Args:
        layer: Boundary type — "community", "beat", or "district".
        id: The boundary feature ID as a string (e.g. "24" for community 24,
            "0735" or "735" for beat 735).
        start: Inclusive start date in YYYY-MM-DD format.
        end: Exclusive end date in YYYY-MM-DD format.

    Returns:
        {
            "layer": str,
            "id": str,               # normalized id after beat zero-stripping
            "start": str,
            "end": str,
            "total_crimes": int,
            "top_types": [
                {"primary_type": str, "count": int},
                ...                  # up to 10 entries, ordered by count desc
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
          AND {col}::text = :id
        GROUP BY day
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