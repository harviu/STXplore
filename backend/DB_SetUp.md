# Crime analytics data

The backend no longer requires PostgreSQL. Historical crime endpoints query the
read-only `data/derived/crime_daily.parquet` dataset with DuckDB.

Rebuild that generated file from the raw Git LFS CSV:

```bash
python -m backend.scripts.build_crime_aggregates
```

Override its runtime location when needed:

```bash
export CRIME_AGGREGATES_PATH=/absolute/path/to/crime_daily.parquet
```

The Parquet schema is:

| Column | Meaning |
|---|---|
| `day` | Calendar day of the incidents |
| `layer` | `community`, `beat`, or `district` |
| `feature_id` | Boundary identifier |
| `primary_type` | Crime category |
| `count` | Number of matching incidents |

The raw CSV is an archival/build input and is not needed at runtime.
