from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from backend.db.database import get_db

router = APIRouter(tags=["date-range"])


@router.get("/date-range")
def date_range(db: Session = Depends(get_db)):
    row = db.execute(
        text("""SELECT to_char(MIN("date"), 'YYYY-MM-DD') AS min_date, to_char(MAX("date"), 'YYYY-MM-DD') AS max_date FROM crime_data""")
    ).mappings().one()
    return {"min": row["min_date"], "max": row["max_date"]}
