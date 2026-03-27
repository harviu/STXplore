# Prediction Backend Context

## API Contract
### 1) By-date prediction
`GET /api/predictions/by-date?date=YYYY-MM-DD&model=<model_name>`

- history window: `[D-89 .. D]`
- forecast window: `[D+1 .. D+30]`
- includes:
  - `forecast_daily`: 30 rows, each row is 77 community predictions
  - `forecast_totals`: 77 aggregate values across 30 days

### 2) Map-shaped prediction
`GET /api/map/predictions?layer=community_area&date=YYYY-MM-DD&model=<model_name>`

- returns map-compatible payload:
  - `{ layer, start, end, model, data: [{ feature_id, count }] }`
- `start=D+1`, `end=D+31` (exclusive)
- layer support in v1: `community_area` only

## Data Source Behavior
- Source is now CSV-pivot only for prediction APIs.
- Default file path:
  - `data/Chicago-Data/Crime/crime_1_day_pivot.csv`
  - configurable via `PRED_DATA_FALLBACK_CSV`
- CSV format expectation:
  - `date` column
  - community columns `1..77`
  - one row per day (or multiple rows per day; rows are summed per day during load)
- Loader behavior:
  - parses `date` to daily grain
  - coerces community values to numeric
  - missing community columns are filled with `0.0`
  - caches a long-form daily table `(day, community, count)`
- Prediction routes no longer depend on DB session injection.
- Dense history matrix is always produced as shape `(90, 77)` with zero-fill for missing day/community.
