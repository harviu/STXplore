from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi import HTTPException 
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.prediction.config import COMMUNITY_IDS
from backend.prediction.data_source import get_daily_rows

router = APIRouter(tags=["map"])


def _parse_iso_date(value: str, field: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field} must be YYYY-MM-DD") from exc

@router.get("/map/counts")
def map_counts( # type: ignore
    start: str = Query(..., description="YYYY-MM-DD (inclusive)"),
    end: str = Query(..., description="YYYY-MM-DD (inclusive)"),
    db: Session = Depends(get_db),
  ):
    """Return total crime counts per community area for a date range, sourced from the database.

    Aggregates raw crime incident records from `crime_data` grouped by
    `community_area`. Community-only — does not support beat or district layers.
    Use /api/map/totals for multi-layer support.

    Args:
        start: Inclusive start date in YYYY-MM-DD format.
        end: Exclusive end date in YYYY-MM-DD format.

    Returns:
        {
            "start": str,
            "end": str,
            "data": [{"community_area": str, "count": int}, ...]
        }
    """
    sql = text("""
      SELECT community_area, COUNT(*)::int AS count
      FROM crime_data
      WHERE "date" >= :start AND "date" <  :end AND community_area IS NOT NULL
      GROUP BY community_area
      ORDER BY community_area;
    """)
    rows = db.execute(sql, {"start": start, "end": end}).mappings().all()
    return {"start": start, "end": end, "data": list(rows)}  # type: ignore


@router.get("/map/counts/pivot")
def map_counts_pivot( # type: ignore
    start: str = Query(..., description="YYYY-MM-DD (inclusive)"),
    end: str = Query(..., description="YYYY-MM-DD (exclusive)"),
):
    """Return total crime counts per community area for a date range, sourced from the CSV pivot file.

    Unlike /api/map/counts which queries the raw PostgreSQL database, this
    endpoint reads from the smoothed CSV pivot file (crime_1_day_pivot.csv)
    that was used to train the AI model. Counts are the smoothed daily values
    summed over the requested date range.

    Use this endpoint — rather than /api/map/counts — wherever results will be
    compared against or used alongside model outputs, to ensure the data comes
    from the same distribution the model was trained on.

    Always returns one entry per community 1..77 even if the count is 0,
    guaranteeing a complete 77-community response regardless of date range.

    Args:
        start: Inclusive start date in YYYY-MM-DD format.
        end: Exclusive end date in YYYY-MM-DD format. Must be after start.

    Returns:
        {
            "start": str,
            "end": str,
            "source": "csv_pivot",
            "data": [{"community_area": int, "count": int}, ...]
        }

    Raises:
        400: If end is not strictly after start.
    """
    start_date = _parse_iso_date(start, "start")
    end_date = _parse_iso_date(end, "end")
    if end_date <= start_date:
        raise HTTPException(status_code=400, detail="end must be after start")

    rows, source = get_daily_rows(start=start_date, end_exclusive=end_date, db=None)
    totals = {community: 0.0 for community in COMMUNITY_IDS}
    for _, community, count in rows:
        if community in totals:
            totals[community] += float(count)

    data = [{"community_area": community, "count": int(round(totals[community]))} for community in COMMUNITY_IDS]
    return {"start": start, "end": end, "source": source, "data": data}
