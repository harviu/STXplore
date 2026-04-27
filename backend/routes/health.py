from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from backend.db.database import get_db

router = APIRouter(tags=["health"])
# Old code to check API, use for debugging and testing API
@router.get("/health")
def health(db: Session = Depends(get_db)):
    """Check that the API server and database connection are both alive.

    Executes a trivial SQL statement against the database. If the server is
    running but the DB is unreachable, this will raise a 500 error rather than
    returning ok=True — making it useful for diagnosing connection issues during
    development or deployment.

    Returns:
        {"ok": True} if both the server and DB are reachable.
    """
    db.execute(text("SELECT 1"))
    return {"ok": True}