from fastapi import APIRouter, Query, HTTPException
from backend.prediction.data_source import get_daily_rows
from datetime import date

router = APIRouter(tags=["selection"])

def _parse(val: str, field: str) -> date:
    try:
        return date.fromisoformat(val)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field} must be YYYY-MM-DD") from exc

@router.get("/selection-daily-csv")
def selection_daily_csv(  # type: ignore
    id: str = Query(..., description="Community area id (1-based integer as string)"),
    start: str = Query(..., description="YYYY-MM-DD (inclusive)"),
    end: str = Query(..., description="YYYY-MM-DD (exclusive)"),
):
    """Return a day-by-day crime count series for a single community, sourced from the CSV pivot file.

    Reads from the smoothed CSV pivot file (crime_1_day_pivot.csv) that was used
    to train the AI model, rather than the raw PostgreSQL database. Used for hover
    tooltip time series in source and actual modes, ensuring the displayed data
    comes from the same distribution the model was trained on.

    Only days that had a non-zero count in the CSV are included in the response.
    The frontend fills any missing days with zeros using the fillDaily utility in
    crimeAggregates.js before rendering the chart.

    Note: This endpoint is community-only. The CSV pivot file does not contain
    beat or district granularity — use /api/selection-daily for those layers.

    Args:
        id: Community area ID as a 1-based integer string (e.g. "24" for community 24).
        start: Inclusive start date in YYYY-MM-DD format.
        end: Exclusive end date in YYYY-MM-DD format.

    Returns:
        {
            "id": str,
            "start": str,
            "end": str,
            "daily": [
                {"date": "YYYY-MM-DD", "count": float},
                ...   # ordered ascending by date, gaps omitted
            ]
        }

    Raises:
        400: If start or end are not valid YYYY-MM-DD dates.
    """
    start_date = _parse(start, "start")
    end_date = _parse(end, "end")
    community_id = int(id)
    rows, _ = get_daily_rows(start=start_date, end_exclusive=end_date)
    daily = [
        {"date": str(day), "count": count}
        for day, community, count in rows
        if community == community_id
    ]
    return {"id": id, "start": start, "end": end, "daily": daily}

@router.get("/selection-all-daily-csv")
def selection_all_daily_csv(  # type: ignore
    start: str = Query(..., description="YYYY-MM-DD (inclusive)"),
    end: str = Query(..., description="YYYY-MM-DD (exclusive)"),
):
    """Return day-by-day crime counts for all 77 communities, sourced from the CSV pivot file.

    Reads from the smoothed CSV pivot file (crime_1_day_pivot.csv) that was used
    to train the AI model, rather than the raw PostgreSQL database. Used for the
    actual crime counts in the prediction time series chart (the "actual" and
    "error" lines), ensuring a fair comparison with model outputs that were also
    trained on this data.

    Only days and communities with non-zero counts are included. The response
    shape is identical to /api/selection-all-daily so the frontend can treat
    both interchangeably.

    Note: This endpoint is community-only. The CSV pivot file does not contain
    beat or district granularity — use /api/selection-all-daily for those layers.

    Args:
        start: Inclusive start date in YYYY-MM-DD format.
        end: Exclusive end date in YYYY-MM-DD format.

    Returns:
        {
            "start": str,
            "end": str,
            "daily": [
                {"id": str, "date": "YYYY-MM-DD", "count": float},
                ...   # ordered ascending by date, gaps omitted
            ]
        }

    Raises:
        400: If start or end are not valid YYYY-MM-DD dates.
    """
    start_date = _parse(start, "start")
    end_date = _parse(end, "end")
    rows, _ = get_daily_rows(start=start_date, end_exclusive=end_date)
    daily = [
        {"id": str(community), "date": str(day), "count": count}
        for day, community, count in rows
    ]
    return {"start": start, "end": end, "daily": daily}