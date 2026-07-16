from fastapi import APIRouter, HTTPException

from backend.db.analytics import crime_analytics


router = APIRouter(tags=["date-range"])


@router.get("/date-range")
def date_range():  # type: ignore
    """Return the earliest and latest incident dates in the aggregate dataset."""
    try:
        row = crime_analytics.date_range()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"min": row["min_date"], "max": row["max_date"]}
