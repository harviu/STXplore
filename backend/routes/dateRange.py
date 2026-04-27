from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from backend.db.database import get_db

router = APIRouter(tags=["date-range"])
# Gets the range of dates from the datatable for disabling invalid dates in the date picker
@router.get("/date-range")
def date_range(db: Session = Depends(get_db)):
    """Return the earliest and latest crime record dates available in the database.

    Queries the MIN and MAX of the `date` column in the `crime_data` table.
    The frontend uses this to disable out-of-range dates in the past map date
    picker, preventing users from selecting a window with no data.

    Note: this reflects the raw database date range, which may differ from the
    CSV pivot file range used for model predictions. For the prediction-valid
    date range use /api/predictions/anchor-bounds instead.

    Returns:
        {
            "min": "YYYY-MM-DD",  # earliest date in crime_data
            "max": "YYYY-MM-DD"   # latest date in crime_data
        }
    """
    row = db.execute(
        text("""SELECT to_char(MIN("date"), 'YYYY-MM-DD') AS min_date, to_char(MAX("date"), 'YYYY-MM-DD') AS max_date FROM crime_data""")
    ).mappings().one()
    return {"min": row["min_date"], "max": row["max_date"]}
