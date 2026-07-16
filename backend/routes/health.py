from fastapi import APIRouter, HTTPException

from backend.db.analytics import crime_analytics


router = APIRouter(tags=["health"])


@router.get("/health")
def health():  # type: ignore
    """Check that the API and read-only Parquet analytics dataset are available."""
    try:
        crime_analytics.health()
    except (FileNotFoundError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"ok": True, "storage": "duckdb-parquet"}
