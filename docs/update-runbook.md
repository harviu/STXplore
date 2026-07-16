# Production update runbook

## Frontend-only changes

Merge to `main` and let Vercel deploy the new build.

## Backend code or dependency changes

Run tests, then deploy the Modal App:

```bash
pytest -q backend/tests
modal deploy modal_app.py
```

## Historical crime data changes

```bash
python -m backend.scripts.build_crime_aggregates
modal volume put --force stxplore-runtime-data data/derived/crime_daily.parquet /crime_daily.parquet
modal deploy modal_app.py
```

## Model or prediction-data changes

```bash
modal volume put --force stxplore-runtime-data models /models
modal volume put --force stxplore-runtime-data data/Chicago-Data/Crime/crime_1_day_pivot.csv /crime_1_day_pivot.csv
modal deploy modal_app.py
```

## Smoke tests

```bash
curl https://YOUR-MODAL-ENDPOINT.modal.run/api/health
curl "https://YOUR-MODAL-ENDPOINT.modal.run/api/map/totals?layer=community_area&start=2001-01-01&end=2001-02-01"
curl "https://YOUR-MODAL-ENDPOINT.modal.run/api/selection-summary?layer=community&id=1&start=2001-01-01&end=2001-02-01"
curl https://YOUR-MODAL-ENDPOINT.modal.run/api/predictions/anchor-bounds
```
