# CrimeSight AI — API & Code Reference

> This document covers the backend API endpoints and the frontend hooks and utilities. For system architecture, data flow, and design decisions see `Architecture.md`.
> **Related documents:** [README](../README.md) | [Architecture](Architecture.md) | [Prediction Backend Context](prediction-backend-context.md) | [Database Setup](../backend/DB_SetUp.md)
>
> **Backend API:** FastAPI auto-generates interactive docs at `/docs` (Swagger UI) and `/redoc` (ReDoc) when the server is running. Those pages let you browse and call every endpoint live in the browser. This document reproduces the same information in a readable format alongside the frontend reference.

---

## Table of Contents

**Backend**
1. [Health & Utility](#1-health--utility)
2. [Map Crime Counts](#2-map-crime-counts)
3. [Selection — Daily Series](#3-selection--daily-series)
4. [Selection — Summary](#4-selection--summary)
5. [Predictions](#5-predictions)
6. [Attribution — Model Level (MI)](#6-attribution--model-level-mi)
7. [Attribution — SAGE](#7-attribution--sage)
8. [Attribution — 4D Tensor (General)](#8-attribution--4d-tensor-general)
9. [Value Bounds](#9-value-bounds)

**Frontend**
10. [api.js — API Call Definitions](#10-apijs--api-call-definitions)
11. [Hooks](#11-hooks)
12. [lib Utilities](#12-lib-utilities)

---

## 1. Health & Utility

### `GET /api/health`

Check that the API server and Parquet analytics dataset are available.

Reads the Parquet dataset through DuckDB. A missing runtime dataset produces a 503 response.

**Response**
```json
{ "ok": true }
```

---

### `GET /api/date-range`

Return the earliest and latest crime dates available in the aggregate dataset.

Queries the minimum and maximum `day` in the Parquet dataset. The frontend uses this to disable out-of-range dates in the past map date picker.

> Note: This reflects the incident-derived date range, which may differ from the CSV pivot file range used for model predictions.

**Response**
```json
{
  "min": "YYYY-MM-DD",
  "max": "YYYY-MM-DD"
}
```

---

## 2. Map Crime Counts

### `GET /api/map/totals`

Return total crime counts per boundary feature from the Parquet aggregates.

Sums precomputed daily counts for the specified boundary layer. Used to color the left and right map polygons.

The `layer` parameter is validated against a hard-coded allow-list. Beat IDs are zero-padded to four digits to match the GeoJSON identifiers.

**Query Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `layer` | string | Yes | `community_area`, `beat`, or `district` |
| `start` | string | Yes | Inclusive start date `YYYY-MM-DD` |
| `end` | string | Yes | Exclusive end date `YYYY-MM-DD` |

**Response**
```json
{
  "layer": "community_area",
  "start": "2024-01-01",
  "end": "2024-02-01",
  "data": [
    { "feature_id": "1", "count": 142 },
    { "feature_id": "2", "count": 87 }
  ]
}
```

---

### `GET /api/map/counts`

Return total incident-derived counts per community area for a date range.

Sums Parquet aggregates by community. Use `/api/map/totals` for multi-layer support.

**Query Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `start` | string | Yes | Inclusive start date `YYYY-MM-DD` |
| `end` | string | Yes | Exclusive end date `YYYY-MM-DD` |

**Response**
```json
{
  "start": "2024-01-01",
  "end": "2024-02-01",
  "data": [
    { "community_area": "1", "count": 142 }
  ]
}
```

---

### `GET /api/map/counts/pivot`

Return total crime counts per community area for a date range, sourced from the CSV pivot file.

Unlike `/api/map/counts`, this endpoint reads from the smoothed model-training pivot CSV.

Use this endpoint — rather than `/api/map/counts` — wherever results will be compared against or used alongside model outputs, to ensure the data comes from the same distribution the model was trained on.

Always returns one entry per community 1–77 even if the count is 0, guaranteeing a complete 77-community response regardless of date range.

**Query Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `start` | string | Yes | Inclusive start date `YYYY-MM-DD` |
| `end` | string | Yes | Exclusive end date `YYYY-MM-DD`. Must be after start. |

**Response**
```json
{
  "start": "2024-01-01",
  "end": "2024-02-01",
  "source": "csv_pivot",
  "data": [
    { "community_area": 1, "count": 142 }
  ]
}
```

**Errors**
- `400` — if `end` is not strictly after `start`

---

## 3. Selection — Daily Series

### `GET /api/selection-daily`

Return a day-by-day crime count series for a single boundary from Parquet.

Sums precomputed counts by calendar day for the selected boundary.

Only days that had at least one crime are included in the response. The frontend fills any missing days with zeros using the `fillDaily` utility in `crimeAggregates.js` before rendering the chart.

Beat IDs are normalized before querying: leading zeros are stripped (e.g. `"0735"` → `"735"`) to match the database storage format.

> Note: For data consistent with the model's training distribution use `/api/selection-daily-csv` instead.

**Query Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `layer` | string | Yes | `community`, `beat`, or `district` |
| `id` | string | Yes | Boundary feature ID (e.g. `"24"` for community 24) |
| `start` | string | Yes | Inclusive start date `YYYY-MM-DD` |
| `end` | string | Yes | Exclusive end date `YYYY-MM-DD` |

**Response**
```json
{
  "layer": "community",
  "id": "24",
  "start": "2024-01-01",
  "end": "2024-02-01",
  "daily": [
    { "date": "2024-01-01", "count": 5 },
    { "date": "2024-01-03", "count": 2 }
  ]
}
```

**Errors**
- `400` — if `layer` is not one of `community`, `beat`, or `district`

---

### `GET /api/selection-daily-csv`

Return a day-by-day crime count series for a single community, sourced from the CSV pivot file.

Reads from the smoothed model-training pivot CSV rather than incident-derived Parquet aggregates.

Only days that had a non-zero count in the CSV are included in the response. The frontend fills any missing days with zeros using the `fillDaily` utility in `crimeAggregates.js` before rendering the chart.

> Note: Community-only. The CSV pivot file does not contain beat or district granularity — use `/api/selection-daily` for those layers.

**Query Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Community area ID, 1-based (e.g. `"24"`) |
| `start` | string | Yes | Inclusive start date `YYYY-MM-DD` |
| `end` | string | Yes | Exclusive end date `YYYY-MM-DD` |

**Response**
```json
{
  "id": "24",
  "start": "2024-01-01",
  "end": "2024-02-01",
  "daily": [
    { "date": "2024-01-01", "count": 4.2 }
  ]
}
```

**Errors**
- `400` — if `start` or `end` are not valid `YYYY-MM-DD` dates

---

### `GET /api/selection-all-daily`

Return day-by-day crime counts for every boundary feature, sourced from the database.

Queries raw crime records from `crime_data` and groups them by boundary feature ID and calendar day. Returns one row per (feature, day) pair that had at least one crime. Used to build the source (past) cluster heatmap — where every community's daily crime pattern is needed simultaneously — and for the actual crime counts displayed on the right map in source mode.

> Note: For data consistent with the model's training distribution use `/api/selection-all-daily-csv` instead.

**Query Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `layer` | string | Yes | `community`, `beat`, or `district` |
| `start` | string | Yes | Inclusive start date `YYYY-MM-DD` |
| `end` | string | Yes | Exclusive end date `YYYY-MM-DD` |

**Response**
```json
{
  "layer": "community",
  "start": "2024-01-01",
  "end": "2024-02-01",
  "daily": [
    { "id": "1", "date": "2024-01-01", "count": 5 },
    { "id": "2", "date": "2024-01-01", "count": 3 }
  ]
}
```

**Errors**
- `400` — if `layer` is not one of `community`, `beat`, or `district`

---

### `GET /api/selection-all-daily-csv`

Return day-by-day crime counts for all 77 communities, sourced from the CSV pivot file.

Reads from the smoothed model-training pivot CSV rather than incident-derived Parquet aggregates.

Only days and communities with non-zero counts are included. The response shape is identical to `/api/selection-all-daily` so the frontend can treat both interchangeably.

> Note: Community-only. The CSV pivot file does not contain beat or district granularity — use `/api/selection-all-daily` for those layers.

**Query Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `start` | string | Yes | Inclusive start date `YYYY-MM-DD` |
| `end` | string | Yes | Exclusive end date `YYYY-MM-DD` |

**Response**
```json
{
  "start": "2024-01-01",
  "end": "2024-02-01",
  "daily": [
    { "id": "1", "date": "2024-01-01", "count": 4.2 },
    { "id": "2", "date": "2024-01-01", "count": 2.8 }
  ]
}
```

**Errors**
- `400` — if `start` or `end` are not valid `YYYY-MM-DD` dates

---

## 4. Selection — Summary

### `GET /api/selection-summary`

Return a crime summary for a single selected boundary, sourced from the database.

Computes the total crime count and the top 10 crime types (by frequency) for the specified boundary feature over the given date range. Used by the right side panel to populate the crime summary block when the user clicks a community, beat, or district on either map.

Beat IDs are normalized before querying: the frontend may send zero-padded strings like `"0735"` but the database stores them as `"735"`, so leading zeros are stripped on the way in.

**Query Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `layer` | string | Yes | `community`, `beat`, or `district` |
| `id` | string | Yes | Boundary feature ID (e.g. `"24"`, `"0735"`) |
| `start` | string | Yes | Inclusive start date `YYYY-MM-DD` |
| `end` | string | Yes | Exclusive end date `YYYY-MM-DD` |

**Response**
```json
{
  "layer": "community",
  "id": "24",
  "start": "2024-01-01",
  "end": "2024-02-01",
  "total_crimes": 312,
  "top_types": [
    { "primary_type": "THEFT", "count": 98 },
    { "primary_type": "BATTERY", "count": 61 }
  ]
}
```

**Errors**
- `400` — if `layer` is not one of `community`, `beat`, or `district`

---

## 5. Predictions

### `GET /api/predictions/anchor-bounds`

Return the valid anchor date range for running predictions.

Reads from the CSV pivot file date range and computes the earliest anchor date that has enough history for the model (`data_min + seq_len - 1` days). The frontend uses these bounds to clamp the date picker so users cannot select a date the model cannot run on.

> Note: This reflects the pivot-file date range. Use `/api/date-range` for the incident-derived range.

**Response**
```json
{
  "data_min": "2001-04-02",
  "data_max": "2024-12-31",
  "anchor_min": "2001-07-01",
  "anchor_max": "2024-12-31",
  "seq_len": 90,
  "source": "csv_pivot"
}
```

---

### `GET /api/predictions/by-date`

Run the model for a given anchor date and return a full 30-day forecast for all 77 communities.

Builds a `(90, 77)` history matrix from the CSV pivot file for the 90 days ending on the anchor date, standardizes it using the model's scaler, runs inference, and de-standardizes the output. Returns both a day-by-day forecast and per-community totals.

**Query Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `date` | string | Yes | Anchor date `YYYY-MM-DD`. Must be within `anchor_min`..`anchor_max`. |
| `model` | string | Yes | Model folder name (e.g. `Transformer`, `iTransformer`) |

**Response**
```json
{
  "model": "Transformer",
  "date": "2024-12-01",
  "history_start": "2024-09-02",
  "history_end": "2024-12-01",
  "forecast_start": "2024-12-02",
  "forecast_end": "2024-12-31",
  "source": "csv_pivot",
  "forecast_daily": [
    { "date": "2024-12-02", "values": [4.1, 2.3, ...] }
  ],
  "forecast_totals": [
    { "feature_id": "1", "count": 124.3 }
  ]
}
```

`forecast_daily` — 30 rows, each with 77 community values (0-indexed order).
`forecast_totals` — 77 entries, `feature_id` is 1-based community ID string.

**Errors**
- `400` — if the anchor date is outside the valid range or the model cannot be loaded
- `404` — if the model folder or checkpoint is not found

---

### `GET /api/map/predictions`

Return map-compatible prediction totals for a given anchor date.

Same as `/api/predictions/by-date` but formats the response as a flat map payload compatible with the frontend's choropleth coloring. Only supports `layer=community_area` in the current version.

**Query Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `layer` | string | Yes | Must be `community_area` |
| `date` | string | Yes | Anchor date `YYYY-MM-DD` |
| `model` | string | Yes | Model folder name |

**Response**
```json
{
  "layer": "community_area",
  "start": "2024-12-02",
  "end": "2025-01-01",
  "model": "Transformer",
  "source": "csv_pivot",
  "data": [
    { "feature_id": "1", "count": 124.3 }
  ]
}
```

---

### `GET /api/predictions/instance-shap`

Compute instance-level SHAP values for a specific prediction.

Explains one scalar model output for a target community and forecast horizon. Kernel SHAP operates on 77 community-history groups against sampled background histories; group values are distributed across 90 days for the response matrix. Optional controls are `samples` (64–2048, default 256), `background_size` (1–32, default 4), and `seed` (default 0).

Returns a `(90, 77)` SHAP value matrix serialized as an array of 90 history day objects, each containing 77 community SHAP values. The frontend sums these across days to get one value per community for the map.

SHAP values are signed: positive means that source community's past crime pushed the target prediction up; negative means it pushed it down.

> Known limitation: SHAP values are not fully deterministic between calls due to random background sample selection. See `ARCHITECTURE.md` Known Issues for details.

**Query Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `date` | string | Yes | Anchor date `YYYY-MM-DD` |
| `model` | string | Yes | Model folder name |
| `horizon` | integer | Yes | Forecast horizon, 1-based (1..30). Day 1 = anchor + 1. |
| `target_community` | integer | Yes | Target community ID, 1-based (1..77) |

**Response**
```json
{
  "model": "Transformer",
  "date": "2024-12-01",
  "target_date": "2024-12-15",
  "horizon": 15,
  "target_community": 24,
  "source": "csv_pivot",
  "prediction": 8.42,
  "baseline": 6.11,
  "shap_sum": 2.28,
  "approx_error": 0.03,
  "history_start": "2024-09-02",
  "history_end": "2024-12-01",
  "top_features": [...],
  "shap_values": [
    { "date": "2024-09-02", "values": [-0.02, 0.14, ...] }
  ]
}
```

`shap_values` — 90 entries (oldest → most recent), each with 77 community SHAP values (0-indexed order, community 1 = index 0).

**Errors**
- `400` — if the anchor date is outside the valid range or model cannot be loaded
- `404` — if the model folder or checkpoint is not found

---

## 6. Attribution — Model Level (MI)

### `GET /api/model_level_relation`

Return model-level MI (Mutual Information) attribution scores for a source or target community.

Slices the precomputed 4D MI tensor for the given model along the selected past and future windows, then averages over those axes to produce a 77-element vector of attribution scores — one per community.

The tensor shape is `(90, 77, 30, 77)`: `(history_lag, source, horizon, target)`. All community indices are 0-based (community 1 in the UI = index 0 here).

Exactly one of `source` or `target` must be provided:
- Providing `target` returns how much each source community influenced the given target (**All Sources → Target** mode)
- Providing `source` returns how much the given source influences each target (**Source → All Targets** mode)

The MI tensor is loaded from disk on first request and cached in memory for all subsequent requests.

**Query Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `model` | string | Yes | Model folder name |
| `source` | integer | No | 0-based source community index (0..76). Mutually exclusive with `target`. |
| `target` | integer | No | 0-based target community index (0..76). Mutually exclusive with `source`. |
| `past_start` | integer | No | Inclusive start on history axis. Default `0`. |
| `past_days` | integer | No | Exclusive end on history axis. Default `90`. |
| `future_start` | integer | No | Inclusive start on horizon axis. Default `0`. |
| `future_days` | integer | No | Exclusive end on horizon axis. Default `30`. |

**Response**
```json
{
  "source": null,
  "target": 23,
  "targets": [0.12, 0.04, ...],
  "model": "Transformer"
}
```

`targets` — 77 floats, 0-indexed by community. Index 0 = community 1.

**Errors**
- `404` — MI tensor file not found for the given model
- `422` — neither or both of `source`/`target` provided, or `future_start >= future_days`

---

### `GET /api/instance_level_relation`

Return instance-level MI attribution scores for a selected source community.

Similar to `/api/model_level_relation` but scoped to a specific source community and slider window, making it instance-specific rather than a global average. Slices the MI tensor to the given past and future window, averages over those axes, and returns a 77-element vector of how much the selected source community relates to each target.

Used in **Source → All Targets** mode to color the right map with the outgoing MI influence of the selected left-map community.

**Query Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `model` | string | Yes | Model folder name |
| `source` | integer | Yes | 0-based source community index (0..76) |
| `past_start` | integer | No | Inclusive start on history axis. Default `0`. |
| `past_days` | integer | Yes | Exclusive end on history axis (1..90) |
| `future_start` | integer | No | Inclusive start on horizon axis. Default `0`. |
| `future_days` | integer | Yes | Exclusive end on horizon axis (1..30) |

**Response**
```json
{
  "source": 23,
  "targets": [0.12, 0.04, ...],
  "past_days": 90,
  "future_days": 30,
  "future_start": 0,
  "model": "Transformer"
}
```

**Errors**
- `404` — MI tensor file not found for the given model
- `422` — if `future_start >= future_days`

---

## 7. Attribution — SAGE

### `GET /api/model_level_sage`

Return model-level SAGE attribution scores for a source or target community.

Slices the precomputed 4D SAGE tensor and **sums** (not averages) over the selected history lag and horizon axes to produce a 77-element attribution vector. SAGE values are signed — positive means amplifying effect on the target's predicted crime, negative means suppressive.

Behavior mirrors `/api/model_level_relation` (same source/target mutual exclusion, same tensor axes) but uses the SAGE tensor and sum aggregation instead of MI and mean.

**Query Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `model` | string | Yes | Model folder name |
| `source` | integer | No | 0-based source index (0..76). Mutually exclusive with `target`. |
| `target` | integer | No | 0-based target index (0..76). Mutually exclusive with `source`. |
| `past_start` | integer | No | Inclusive start on history axis. Default `0`. |
| `past_days` | integer | No | Exclusive end on history axis. Default `90`. |
| `future_start` | integer | No | Inclusive start on horizon axis. Default `0`. |
| `future_days` | integer | No | Exclusive end on horizon axis. Default `30`. |

**Response**
```json
{
  "source": null,
  "targets": [-0.003, 0.041, ...],
  "model": "Transformer"
}
```

**Errors**
- `404` — SAGE tensor file not found for the given model
- `422` — neither or both of `source`/`target` provided, or `future_start >= future_days`

---

### `GET /api/instance_level_sage`

Return instance-level SAGE attribution scores for a selected source community, sliced to the current slider window.

Same as `/api/model_level_sage` but always requires a `source` and is restricted to the slider-defined time window. Used in **Source → All Targets / Instance Level** mode.

**Query Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `model` | string | Yes | Model folder name |
| `source` | integer | Yes | 0-based source community index (0..76) |
| `past_start` | integer | No | Inclusive start on history axis. Default `0`. |
| `past_days` | integer | Yes | Exclusive end on history axis (1..90) |
| `future_start` | integer | No | Inclusive start on horizon axis. Default `0`. |
| `future_days` | integer | Yes | Exclusive end on horizon axis (1..30) |

**Response**
```json
{
  "source": 23,
  "targets": [-0.003, 0.041, ...],
  "past_days": 90,
  "future_days": 30,
  "future_start": 0,
  "model": "Transformer"
}
```

---

## 8. Attribution — 4D Tensor (General)

### `GET /api/data4d`

Perform an arbitrary slice of the 4D MI or SAGE tensor and return the result.

This is a low-level general-purpose tensor slicing endpoint used for the cluster heatmap and hover tooltip time series in relation and instance modes. The tensor shape is `(90, 77, 30, 77)`: `(history_lag, source, horizon, target)`. All community indices are 0-based.

**Parameter to tensor axis mapping:**

| Parameter | Tensor axis | Description |
|---|---|---|
| `d1` / `b1` | axis 0 — history_lag | 0 = most recent, 89 = oldest |
| `d2` | axis 1 — source community | 0-indexed, `null` = all |
| `d3` / `b3` | axis 2 — horizon | 0 = D+1, 29 = D+30 |
| `d4` | axis 3 — target community | 0-indexed, `null` = all |

The boolean flags change slicing behavior:
- `b1=False` → use `d1` as a scalar index or upper bound
- `b1=True` → use full axis 0 as a range up to `d1`
- `b3=False` → use `d3` as a scalar horizon index
- `b3=True` → slice horizon as `[d3_start:d3]`

When both `b1=True` and `b3=True` (the most common frontend call):
- Slices history as `[:]` and horizon as `[d3_start:d3]`
- Aggregates: SAGE uses **sum** over the horizon window; MI uses **mean**
- If `d1` is set, further slices the aggregated result to `[d1_start:d1]`
- Produces the 2D `(community × time)` array used by the cluster heatmap

**Normalization** (`normalize=True`):
- MI: rescales to 0–100 using the full-tensor min/max as reference
- SAGE: rescales to -100–100 using the full-tensor absolute max as reference

**Query Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `model` | string | Yes | Model folder name |
| `data_mode` | string | No | `"mi"` (default) or `"sage"` |
| `d1` | integer | No | Axis 0 bound (meaning changes with `b1`) |
| `b1` | boolean | No | If `true`, treat axis 0 as a full range. Default `false`. |
| `d2` | integer | No | Axis 1 (source) index, 0-based. `null` = all. |
| `d3` | integer | No | Axis 2 bound (meaning changes with `b3`) |
| `b3` | boolean | No | If `true`, treat axis 2 as a range. Default `false`. |
| `d4` | integer | No | Axis 3 (target) index, 0-based. `null` = all. |
| `d3_start` | integer | No | Start of horizon range when `b3=true`. Default `0`. |
| `d1_start` | integer | No | Start of history range for post-aggregation slice. Default `0`. |
| `normalize` | boolean | No | Normalize output. Default `false`. |

**Response**

A nested JSON array. Shape depends on which axes were fixed vs ranged:
- `[float, ...]` — 1D community attribution vector
- `[[float, ...], ...]` — 2D community × time heatmap matrix

**Errors**
- `404` — tensor file not found for the given model/data_mode
- `422` — `d2` or `d4` out of bounds (must be 0..76)

---

## 9. Value Bounds

### `GET /api/value-bounds`

Return the global min and max values of the MI and SAGE tensors for a given model.

Loads both the full MI and SAGE 4D tensors and computes their global minimum and maximum values. Used by the frontend to build a consistent color scale anchored to the true data range rather than the range of whichever slice is currently visible.

Both tensors are loaded on first request and the result is cached in memory per model. Subsequent calls return immediately from cache.

**Query Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `model` | string | Yes | Model folder name |

**Response**
```json
{
  "sage": { "min": -0.84, "max": 56.3 },
  "mi":   { "min": 0.0,   "max": 100.0 }
}
```

**Errors**
- `404` — SAGE or MI tensor file not found for the given model

---

## 10. api.js — API Call Definitions

**Location:** `src/lib/api.js`

Every backend endpoint has a corresponding function here. All functions accept an optional `opts` object that is forwarded to `fetch` — the most important field is `signal` (an `AbortSignal` from an `AbortController`) used by hooks to cancel in-flight requests when dependencies change.

| Function | Endpoint | Notes |
|---|---|---|
| `api.health(opts)` | `GET /api/health` | |
| `api.dateRange(opts)` | `GET /api/date-range` | |
| `api.mapTotals(layer, start, end, opts)` | `GET /api/map/totals` | |
| `api.mapCountsPivot(start, end, opts)` | `GET /api/map/counts/pivot` | |
| `api.selectionSummary(layer, id, start, end, opts)` | `GET /api/selection-summary` | |
| `api.selectionDaily(layer, id, start, end, opts)` | `GET /api/selection-daily` | DB source |
| `api.selectionDailyCsv(id, start, end, opts)` | `GET /api/selection-daily-csv` | CSV source, no layer param |
| `api.selectionAllDaily(layer, start, end, opts)` | `GET /api/selection-all-daily` | DB source |
| `api.selectionAllDailyCsv(start, end, opts)` | `GET /api/selection-all-daily-csv` | CSV source, no layer param |
| `api.predictionAnchorBounds(opts)` | `GET /api/predictions/anchor-bounds` | |
| `api.predictionByDate(date, model, opts)` | `GET /api/predictions/by-date` | |
| `api.mapPredictions(layer, date, model, opts)` | `GET /api/map/predictions` | |
| `api.predictionInstanceShap(date, model, horizon, targetCommunity, opts)` | `GET /api/predictions/instance-shap` | targetCommunity is 1-based |
| `api.relationalModel(target, model, pastStart, pastDays, futureStart, futureEnd, opts)` | `GET /api/model_level_relation` | target is 0-based |
| `api.relationalModelSource(source, model, pastStart, pastDays, futureStart, futureEnd, opts)` | `GET /api/model_level_relation` | source is 0-based |
| `api.sageLevelRelation(target, model, pastStart, pastDays, futureStart, futureEnd, opts)` | `GET /api/model_level_sage` | target is 0-based |
| `api.sageLevelSource(source, model, pastStart, pastDays, futureStart, futureEnd, opts)` | `GET /api/model_level_sage` | source is 0-based |
| `api.instanceLevelRelation(sourceIdx, model, pastStart, pastDays, futureStart, futureEnd, opts)` | `GET /api/instance_level_relation` | sourceIdx is 0-based |
| `api.instanceLevelSage(sourceIdx, model, pastStart, pastDays, futureStart, futureEnd, opts)` | `GET /api/instance_level_sage` | sourceIdx is 0-based |
| `api.get4dData(d1, b1, d2, d3, b3, d4, model, dataMode, opts)` | `GET /api/data4d` | See Section 8 for axis mapping |
| `api.valueBounds(model, opts)` | `GET /api/value-bounds` | |

> **Index reminder:** Functions that accept a community index send it 0-based to the backend. Functions that accept a community ID (like `predictionInstanceShap`) send it 1-based. Always check the function signature comment in `api.js` before passing a community value.

---

## 11. Hooks

All hooks live in `src/hooks/`. All data-fetching hooks use `AbortController` to cancel stale requests when their dependencies change.

---

### `useApi(makePromise, deps, options?)`

**Location:** `src/hooks/useApi.js`

The base data-fetching hook used by all other hooks. Manages loading/data/error state and automatically cancels the previous request when dependencies change.

`makePromise` receives `{ signal }` and must return a Promise. If the Promise rejects with an `AbortError` it is silently ignored. Any other error is captured in `error`.

```js
const { data, loading, error } = useApi(
  ({ signal }) => api.someEndpoint(param, { signal }),
  [param]
);
```

**Options**

| Option | Default | Description |
|---|---|---|
| `keepPreviousData` | `true` | If `false`, clears `data` to `null` on each new fetch instead of keeping the previous value visible during loading |

**Returns** `{ data, loading, error }`

---

### `useModelRelationCounts(activeMode, layer, relationSelectedId, model, dataMode, pastStart, pastDays, futureStart, futureEnd, direction?)`

**Location:** `src/hooks/useModelRelationCounts.js`

Fetches MI or SAGE attribution scores for a selected community and returns them as a community-ID-keyed count map for the map choropleth.

Only fires when `activeMode === "relation"` and `layer === "community"` and `relationSelectedId` is set. Returns `null` counts otherwise. Automatically picks the correct endpoint based on `dataMode` (`"mi"` or `"sage"`) and `direction` (`"target"` or `"source"`).

Community IDs in the returned `counts` object are 1-based strings (e.g. `"1"` through `"77"`).

**Returns** `{ counts, loading, error }`

---

### `useInstanceRelationCounts(activeMode, instanceSelectedId, model, pastStart, pastDays, futureStart, futureEnd, dataMode?)`

**Location:** `src/hooks/useInstanceRelationCounts.js`

Fetches instance-level MI or SAGE attribution scores for a selected source community in **Source → All Targets** mode. Only fires when `activeMode === "instance"` and `instanceSelectedId` is set.

Converts the 1-based `instanceSelectedId` from the UI to a 0-based index before calling the API. Returns a community-ID-keyed count map (1-based string keys).

**Returns** `{ counts, loading, error }`

---

### `useInstanceShapCounts(activeMode, targetCommunityId, model, forecastAnchorDate, horizon, pastStart, pastEnd)`

**Location:** `src/hooks/useInstanceShapCounts.js`

Fetches live SHAP values for a target community and returns both a per-community summed count map (for the map choropleth) and a raw `(77 × days)` matrix (for the cluster heatmap).

Only fires when `activeMode === "instance"`, `targetCommunityId` is set, `forecastAnchorDate` is set, and `horizon` is set. Slices the SHAP response to the `[pastStart, pastEnd]` window before summing.

> Warning: SHAP values are not deterministic between calls. See `ARCHITECTURE.md` Known Issues.

**Returns** `{ counts, loading, error, matrix }`

- `counts` — `{ "1": float, ..., "77": float }` summed SHAP per community, 1-based keys
- `matrix` — `number[][]` of shape `(77, days)` for the cluster heatmap, or `null`

---

### `useHoverDailySeries({ hover, activeMode, secondaryMode, tensorSourceId, model, dataMode, pastStart, pastEnd, tPastStart, tPastDays, futureStart, futureEnd, anchorDate, forecastAnchorDate, shapHorizon })`

**Location:** `src/hooks/useHoverDailySeries.js`

Fetches the daily time series shown in the map hover tooltip. Debounced at 200ms. Results are cached in a `Map` keyed by a string derived from the hover parameters, so re-hovering the same community does not re-fetch.

The fetch path depends on the current mode:
- **Instance mode (left map)** — fetches SHAP values and extracts the hovered community's daily series from the response
- **Relation/Model/Data mode (left map)** — fetches a 4D tensor slice for the hovered source community
- **Source mode or right map** — fetches the daily CSV series for the hovered community

**Returns** `{ hoverDaily, hoverDailyLoading, canShowHoverData }`

- `hoverDaily` — `[{ date, count }]` or `null`
- `canShowHoverData` — boolean gate; false means the current hover state is not displayable (e.g. wrong map side for the current mode)

---

### `useClusterDailySeries({ mode, relationDataMode, selectedCommunities, heatData, targetCommunityId, forecastAnchorDate, shapHorizon, relationModel, pastDays, futureEnd, anchorDate, rangeStart, rangeEnd })`

**Location:** `src/hooks/useClusterDailySeries.js`

Fetches daily time series for communities selected via the cluster heatmap dendrogram. Returns one series per selected leaf community for rendering in the temporal line charts below the heatmap.

The fetch path depends on mode:
- **Source mode** — reads directly from `heatData` (already loaded)
- **SHAP/Instance mode** — fetches SHAP values live and extracts the selected communities' series
- **Relation/Data mode** — reads directly from `heatData`

**Returns** `{ communitySeriesList, loading }`

- `communitySeriesList` — `[{ id, label, series: [{ date, count }] }]`

---

### `useValueBounds(model)`

**Location:** `src/hooks/useValueBounds.js`

Fetches the global min/max values of the MI and SAGE tensors for the given model. Used to anchor the diverging color scales so zero always maps to white regardless of the current slice. Re-fetches automatically when the model changes.

**Returns** `{ sageBounds, miBounds, loading, error }`

- `sageBounds` — `{ min: float, max: float }` or `null`
- `miBounds` — `{ min: float, max: float }` or `null`

---

## 12. lib Utilities

### `src/lib/dates.js`

Date arithmetic utilities used throughout the frontend.

| Function | Description |
|---|---|
| `toYYYYMMDD(date)` | Converts a `Date` object to a `"YYYY-MM-DD"` string |
| `addDaysISO(iso, days)` | Adds `days` to an ISO date string and returns a new ISO string |
| `todayISO()` | Returns today's date as `"YYYY-MM-DD"` |
| `isoRangeDays(startISO, endISO)` | Returns an array of ISO date strings for every day in `[start, end)` |
| `sourceRange(pastStartOffset, pastEndOffset, anchorISO)` | Converts past slider offsets to `{ start, end }` ISO date strings for the left map window |
| `targetRange(futureStartOffset, futureEndOffset, anchorISO)` | Converts future slider offsets to `{ start, end }` ISO date strings for the right map window |
| `clampDateIso(iso, minIso, maxIso)` | Clamps a date string to `[min, max]` inclusive |

---

### `src/lib/crimeAggregates.js`

Utilities for transforming crime count data.

| Function | Description |
|---|---|
| `fillDaily(start, end, rows)` | Takes a sparse `[{ date, count }]` array and fills every day in `[start, end)` with `0` for missing dates. Used before rendering any line chart to ensure no gaps. |
| `responseToCounts(resp)` | Converts a backend map response `{ data: [{ feature_id, count }] }` into a plain object `{ "1": count, "2": count, ... }` keyed by 1-based community ID string. Used to feed choropleth color data to `MapBoxMap`. |

---

### `src/lib/colors.js`

Color stop arrays for all map and heatmap scales. Import from here — do not hardcode color values in components.

| Export | Used for | Scale type |
|---|---|---|
| `CHOROPLETH_STOPS` | Past map crime counts | Sequential yellow → red |
| `RELATION_STOPS` | MI (Data Level) attribution | Sequential light blue → dark green |
| `SAGE_STOPS` | SAGE and SHAP cluster heatmap (d3 interpolator) | Diverging red → white → green, 7 stops including explicit white midpoint |
| `SAGE_LEGEND_STOPS` | SAGE and SHAP map legend (`getLegendStepsDiverging`) | Diverging red → green, 6 stops — no white; legend inserts white at zero programmatically |
| `ERROR_STOPS` | Error map (actual − predicted) | Diverging blue → white → red |

All arrays contain 5–7 hex color strings ordered low → high. `SAGE_STOPS` is passed to `d3.interpolateRgbBasis()` in `ClusterHeatmap` and requires the explicit white midpoint for correct zero rendering. `SAGE_LEGEND_STOPS` omits white because `getLegendStepsDiverging` in `MapBoxMap` handles the zero entry itself — including white in both would produce a duplicate step in the legend.

---

### `src/lib/mapFacesReducer.js`

Reducer and initial state for tracking the selected layer and community ID independently for each of the six map tabs (source, relation, instance, target, actual, error).

**Actions:**

`SET_FACET_LAYER` — changes the boundary layer for a tab, optionally clearing the selection:
```js
dispatch({ type: "SET_FACET_LAYER", facet: "source", layer: "beat", clearSelection: true })
```

`SET_FACET_SELECTION` — sets the selected community ID for a tab:
```js
dispatch({ type: "SET_FACET_SELECTION", facet: "target", selectedId: "24" })
```

**State shape:**
```js
{
  source:   { layer: "community", selectedId: null },
  relation: { layer: "community", selectedId: null },
  instance: { layer: "community", selectedId: null },
  target:   { layer: "community", selectedId: null },
  actual:   { layer: "community", selectedId: null },
  error:    { layer: "community", selectedId: null },
}
```

---

### `src/lib/relationTargets.js`

| Export | Description |
|---|---|
| `RELATION_TARGET_LEN` | Constant `77` — the expected length of every `targets` array from attribution endpoints |
| `targetsToCountsByCommunityId(targets)` | Converts a 0-indexed `targets` array of 77 floats into a `{ "1": float, ..., "77": float }` map keyed by 1-based community ID string. Used by all relation hooks before passing data to the map. |
