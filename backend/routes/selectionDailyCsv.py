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
    start_date = _parse(start, "start")
    end_date = _parse(end, "end")
    rows, _ = get_daily_rows(start=start_date, end_exclusive=end_date)
    daily = [
        {"id": str(community), "date": str(day), "count": count}
        for day, community, count in rows
    ]
    return {"start": start, "end": end, "daily": daily}