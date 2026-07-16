# Deployment Guide: Vercel + Modal + DuckDB/Parquet

Production consists of a Vite frontend on Vercel and a FastAPI backend on Modal.
Historical analytics are read from a compact Parquet file with DuckDB; no
PostgreSQL service is required.

## 1. Build runtime analytics data

Install the backend dependencies and ensure the Git LFS source CSV is present:

```bash
pip install -r backend/requirements.txt
git lfs pull --include="data/Chicago-Data/Crime/cleaned_Crimes_-_2001_to_Present_20250114.csv"
python -m backend.scripts.build_crime_aggregates
```

The generated runtime file is `data/derived/crime_daily.parquet`.

## 2. Create and populate the Modal Volume

```bash
pip install modal
modal setup
modal volume create stxplore-runtime-data
modal volume put stxplore-runtime-data data/derived/crime_daily.parquet /crime_daily.parquet
modal volume put stxplore-runtime-data data/Chicago-Data/Crime/crime_1_day_pivot.csv /crime_1_day_pivot.csv
modal volume put stxplore-runtime-data models /models
```

The raw 1.6 GiB incident CSV is not uploaded. Modal receives only the compact
analytics file, prediction pivot, and model artifacts.

## 3. Deploy FastAPI

```bash
modal deploy modal_app.py
```

Modal prints the HTTPS web endpoint. Verify it directly:

```bash
curl https://YOUR-MODAL-ENDPOINT.modal.run/api/health
curl "https://YOUR-MODAL-ENDPOINT.modal.run/api/map/totals?layer=community_area&start=2001-01-01&end=2001-02-01"
```

## 4. Point Vercel at Modal

Replace the destination in `vercel.json`:

```json
{
  "source": "/api/:path*",
  "destination": "https://YOUR-MODAL-ENDPOINT.modal.run/api/:path*"
}
```

Commit and push. Vercel then redeploys the frontend, and browser `/api/...`
requests are proxied to Modal over HTTPS.

## 5. Local development

```bash
uvicorn backend.main:app --reload
npm install
npm run dev
```

The default local paths are already configured for the generated Parquet,
prediction CSV, and model folders. Override them with `CRIME_AGGREGATES_PATH`,
`PRED_DATA_FALLBACK_CSV`, or `PRED_MODELS_DIR` when necessary.

## Updating production data

Rebuild and replace the Parquet file, then redeploy so new containers see the
latest Volume contents:

```bash
python -m backend.scripts.build_crime_aggregates
modal volume put --force stxplore-runtime-data data/derived/crime_daily.parquet /crime_daily.parquet
modal deploy modal_app.py
```
