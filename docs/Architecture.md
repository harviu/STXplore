# CrimeSight AI — Architecture & System Documentation

> **Audience:** Developers who are new to the codebase and need to understand how the system is structured, what it does, and why decisions were made the way they were. This is not a step-by-step tutorial — it assumes you are comfortable reading code but have not seen this project before.

> **Related documents:** [README](../README.md) | [Code Reference](Code_Reference.md) | [Prediction Backend Context](prediction-backend-context.md) | [Database Setup](../backend/DB_SetUp.md)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [High-Level Architecture](#3-high-level-architecture)
4. [Data Sources](#4-data-sources)
5. [Relationship Mode — All Sources → Target](#5-relationship-mode--all-sources--target)
6. [Relationship Mode — Source → All Targets](#6-relationship-mode--source--all-targets)
7. [The Left Map and Right Map](#7-the-left-map-and-right-map)
8. [Left Map Tabs](#8-left-map-tabs)
9. [Right Map Tabs](#9-right-map-tabs)
10. [Frontend Structure](#10-frontend-structure)
11. [Backend Structure](#11-backend-structure)
12. [The Prediction Pipeline](#12-the-prediction-pipeline)
13. [AI Attribution Methods](#13-ai-attribution-methods)
14. [The 4D Tensor System](#14-the-4d-tensor-system)
15. [Slider Windowing System](#15-slider-windowing-system)
16. [Color Scaling](#16-color-scaling)
17. [Index System — Critical Detail](#17-index-system--critical-detail)
18. [Key Design Decisions](#18-key-design-decisions)
19. [Known Issues](#19-known-issues)
20. [Environment & Configuration](#20-environment--configuration)

---

## 1. Project Overview

CrimeSight AI is a research focused full-stack web application. It provides an interactive dashboard for visualizing and exploring the outputs of an AI model trained to predict crime across Chicago's 77 community areas.

The application serves two main purposes:

- **Visualization** — display historical crime data and model predictions on interactive maps, heatmaps, and time series charts.
- **Explainability** — show *why* the model made a prediction, using attribution methods (SHAP, SAGE, and MI) that highlight which communities and time periods most influenced a given forecast.



The student development team built the entire application — the frontend, the backend routes, and the database layer. The research team contributed the AI model, its training pipeline, and the precomputed attribution tensors, which live in the `backend/prediction/` and `models/` folders. All of this is included in the repository. The only external dependency not included is a running PostgreSQL database instance, which needs to be set up locally using the provided crime data CSV and the instructions in `backend/DB_SetUp.md`.

---

## 2. Repository Structure

```
Community-Heatmaps/
├── backend/                        # Python / FastAPI backend
│   ├── db/
│   │   └── database.py             # SQLAlchemy DB connection
│   ├── prediction/                 # Prediction + attribution logic (research team)
│   │   ├── models/                 # PyTorch model definitions
│   │   ├── config.py               # Paths and model constants
│   │   ├── data_source.py          # CSV loading and caching
│   │   ├── runtime.py              # Model checkpoint loading
│   │   ├── schemas.py              # Dataclasses for API results
│   │   ├── service.py              # Prediction + SHAP computation
│   │   └── windowing.py            # Date window math
│   ├── routes/                     # FastAPI route files (one per feature area)
│   ├── tests/                      # Backend test suite (research team)
│   ├── main.py                     # FastAPI app entry point
│   └── requirements.txt
├── data/
│   └── Chicago-Data/
│       ├── Boundaries/             # GeoJSON boundary files (community, beat, district)
│       └── Crime/
│           ├── crime_1_day_pivot.csv   # Smoothed daily crime data used for model training
│           └── cleaned_Crimes_*.csv    # Raw crime data for DB import
├── models/                         # Model artifacts (not in repo — provided by research team)
│   ├── Transformer/
│   │   ├── checkpoint/             # checkpoint.pth, model_config.json, scaler.npz
│   │   ├── mi/                     # mi_input_output.npy  (shape: 90×77×30×77)
│   │   └── sage/                   # sage_4d_history_source_horizon_target.npy
│   └── iTransformer/
│       └── (same structure)
├── src/                            # React frontend
│   ├── components/                 # UI components
│   ├── hooks/                      # Custom React hooks (data fetching)
│   └── lib/                        # Shared utilities (api.js, colors.js, dates.js, etc.)
├── public/                         # Static assets
├── index.html
├── vite.config.js
└── package.json
```

**Important distinction:** The student development team built the frontend, all backend routes, and the database layer. The research team contributed the ML components — primarily `backend/prediction/`, `backend/tests/`, `models/`, and `data/`. `service.py` was touched by both — the student team made targeted edits when needed to wire up specific API behaviors, but the core prediction and SHAP logic belongs to the research team. Do not modify anything inside `backend/prediction/` without fully understanding the prediction pipeline first.

---

## 3. High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (React)                   │
│                                                      │
│   App.jsx                                            │
│   ├── MapPanel.jsx       (maps + all controls)       │
│   ├── SidePanel.jsx      (right side: selection info)│
│   └── DashboardPanel.jsx (heatmaps + charts)         │
└───────────────────────┬─────────────────────────────┘
                        │ HTTP  (Vite dev proxy → /api)
┌───────────────────────▼─────────────────────────────┐
│                 Backend (FastAPI / Python)            │
│                                                      │
│   backend/routes/         (one file per feature)     │
│   backend/prediction/     (model + attribution)      │
│   backend/db/             (database connection)      │
└──────────┬──────────────────────────┬───────────────┘
           │                          │
┌──────────▼──────────┐   ┌───────────▼──────────────┐
│   PostgreSQL DB      │   │  File System              │
│   crime_data table   │   │  models/  (checkpoints,   │
│   (raw crime records)│   │   MI + SAGE tensors)      │
│                      │   │  data/    (pivot CSV)      │
└─────────────────────┘   └──────────────────────────┘
```

The frontend runs on **React + Vite**. During development, Vite proxies all `/api` requests to the FastAPI server so CORS is not an issue. Maps are rendered with **MapboxGL**. The cluster heatmap and bar charts are built with **D3.js**.

---

## 4. Data Sources

The application uses two different data sources. Knowing which one is used where — and why — is important, because mixing them up produces inconsistent results.

### PostgreSQL Database

The database holds raw individual crime incident records from Chicago's public crime dataset. Each row is one crime event with fields like `date`, `community_area`, `primary_type`, `beat`, `district`, and more. See `backend/DB_SetUp.md` for the full schema and the import command.

Used for:
- The **past (left) map** — real historical crime counts
- The **right side panel** — daily crime count chart, total crime count, and top offense type breakdown for any selected community, beat, or district

### CSV Pivot File (`crime_1_day_pivot.csv`)

A preprocessed, smoothed dataset used to train the AI model. It is a pivot table with one row per day and one column per community area (1–77), where each cell is the smoothed daily crime count for that community. Located at:

```
data/Chicago-Data/Crime/crime_1_day_pivot.csv
```

Configurable via the `PRED_DATA_FALLBACK_CSV` environment variable.

Used for:
- All **model inputs** — any time data is fed into the model for prediction or explanation
- The **time series actual and error lines** in the prediction panel — to ensure fair comparison with model output

**Why the split?** The raw database counts differ from the smoothed training data. If the "actual" line in a chart used raw DB counts while the "predicted" line came from a model trained on smoothed data, the comparison would be between two different distributions. Using the CSV for both keeps it consistent with what the model was trained on.

### Data Coverage

The CSV caps at **2024-12-31**. Dates beyond this are not supported for any model feature. The backend enforces this via `/api/predictions/anchor-bounds`, and the frontend automatically clamps the date picker to the valid range.

---

## 5. Relationship Mode — All Sources → Target

Selected via the "Relationship mode" dropdown. This is the default mode.

**The core idea:** You select a target community on the right map, and the left map answers the question — *which communities most influenced that target's prediction, and by how much?*

**Right map** — start here. Select a community on the Predicted map. That community becomes the attribution target. The right map continues to display Predicted, Actual, or Error coloring for all communities, with your selected target highlighted. The selection you make here is what drives everything on the left.

**Left map** — once a target is selected on the right, the left map colors all 77 communities by their attribution score toward that target. The specific attribution method shown depends on the active left tab (SAGE for Model Level, SHAP for Instance Level, MI for Data Level). A darker/more saturated color means that community had stronger influence — positive or negative — on the selected target's forecast.

The left map tab buttons (Model Level, Instance Level, Data Level) are grayed out and unclickable until a community has been selected on the right map. The right map selection is the prerequisite for all left-map attribution views in this mode.

**Typical use case:** A researcher wants to understand what drove the model's crime forecast for a specific community. Selecting that community on the right map immediately shows which other communities around Chicago the model considered most influential — essentially a spatial explanation of one prediction.

---

## 6. Relationship Mode — Source → All Targets

Selected via the "Relationship mode" dropdown.

**The core idea:** You select a source community on the left map, and the right map answers the question — *how much does that community's past crime influence the predictions for every other community?*

**Left map** — start here. In Past mode it shows historical crime counts for all 77 communities, functioning as a community picker. Select a community on the left. That community becomes the attribution source and drives the right map's Relation tab. Independently, if you also switch the left tab to Model Level, Instance Level, or Data Level, the left map will color all communities by their attribution *toward* whatever community is currently selected on the right map — both selections are active simultaneously. This means the left and right map selections are independent of each other and drive different things at the same time.

**Right map** — switch to the **Relation** tab to see the outgoing influence of the selected left-map community mapped across all 77 target communities. Each community on the right map is colored by how much the selected source on the left influences its predicted crime. The Predicted, Actual, and Error tabs remain available and continue to show their standard content — switching between them does not clear the Relation view, it just changes which right-map tab is visible.

**A key quirk of this mode:** Both map selections are live simultaneously. The community selected on the left drives the right map's Relation coloring. The community selected on the right drives the left map's attribution coloring (when on Model Level, Instance Level, or Data Level tabs). You can have both selected at once and read attribution in both directions.

**Typical use case:** A researcher wants to use the visualization as a ground truth check — selecting a high-crime community to see whether the model correctly identifies it as having widespread influence on surrounding areas, or whether its influence is concentrated in a specific direction.

---

## 7. The Left Map and Right Map

With the relationship modes in mind, here is a summary of what each map shows and what controls it.

**The left map** is controlled by the left tab buttons (Past, Model Level, Instance Level, Data Level) and the past window slider (0–90 days before the anchor date).

- In **Past mode** — shows real historical crime counts, colored yellow to red. Doubles as a community picker in Source → All Targets mode.
- In **Model Level, Instance Level, or Data Level** — shows attribution scores (SAGE, SHAP, or MI) for all communities relative to the currently selected target or source community. Colors use a diverging red-white-green scale centered at zero. The specific target or source that drives this coloring depends on the active relationship mode (see Sections 5 and 6).

**The right map** is controlled by the right tab buttons (Predicted, Actual, Error, Relation) and the future window slider (0–30 days after the anchor date).

- In **Predicted** — shows the model's crime forecast per community over the selected future window.
- In **Actual** — shows real crime counts from the same future window, sourced from the CSV pivot file.
- In **Error** — shows the difference between actual and predicted (actual minus predicted) per community.
- In **Relation** (Source → All Targets mode only) — shows the outgoing attribution of the left-map selected community across all 77 targets.

The **anchor date** is the dividing line between past and future. It is set by the user via a date picker and defaults to the latest available date in the CSV. The left map always looks backward from it; the right map always looks forward.

The **side panel** sits on the right side of the screen and shows summary statistics and daily charts for whichever community is selected on either map.

---

## 8. Left Map Tabs

These buttons appear above the left map and switch what the left map is displaying.

### Past

The default. Shows actual historical crime counts for all 77 community areas, aggregated over the past window. Toggle between **total** count and **average per day**. Layer can be switched between community area, police beat, or police district.

### Model Level

Shows SAGE attribution values from the precomputed tensor. Values are signed — positive means the source community amplified the target's predicted crime, negative means it suppressed it. Layer is locked to community. Becomes active only after the prerequisite community selection has been made (see Sections 5 and 6 for which map that is, depending on mode).

### Instance Level (SHAP or SAGE)

Shows instance-specific attribution for a single prediction. In **All Sources → Target** mode this is SHAP — computed live from the model for a specific date, target community, and horizon. In **Source → All Targets** mode this is SAGE sliced to the selected source community and time window. SHAP takes several seconds to compute; SAGE reads from the precomputed tensor immediately.

### Data Level

Shows MI (Mutual Information) values — a statistical measure of how related two communities' crime patterns are, computed purely from the data with no model involved. Always non-negative. The model selector is hidden in this mode because MI does not depend on which model is loaded.

---

## 9. Right Map Tabs

These buttons appear above the right map and switch what the right map is displaying.

### Predicted

The model's crime forecast for the 30 days following the anchor date, summed over the selected future window. Requires community layer and a valid anchor date within the CSV date range.

### Actual

Real crime counts from the future window, sourced from the CSV pivot file to match the model's training data. Only available when the anchor date is far enough in the past that actual data exists for the forecast period.

### Error

Actual minus predicted crime per community over the future window. Positive = more crime than predicted; negative = less. Only available when Actual is available.

### Relation

Only visible in **Source → All Targets** relationship mode. Colors the right map by how strongly the community selected on the left map influences each of the other 77 communities' predictions. Switching to this tab is how you see the full outgoing attribution picture for the selected source community.

---

## 10. Frontend Structure

### Component Tree

```
App.jsx
├── MapPanel.jsx
│   ├── MapBoxMap.jsx  ×2  (left map, right map)
│   └── tooltipMap.jsx     (hover tooltip via React portal)
├── SidePanel.jsx           (right side panel)
└── DashboardPanel.jsx
    └── ClusterHeatmap.jsx  ×2  (past heatmap, future heatmap)
```

### App.jsx

The root component. Manages top-level application state (active mode, selections, heatmap data, anchor date) and distributes it to child components. Also handles responsive layout — on narrow screens the side panel stacks below the maps.

### MapPanel.jsx

The most complex component in the codebase. It manages:

- All left and right map mode and tab state
- Left and right community selections, tracked independently per tab via `mapFacesReducer`
- The past (0–90 days) and future (0–30 days) slider controls, debounced at 150ms
- Model selection and relationship mode selection
- All data fetching for both maps (crime counts, predictions, SAGE, MI, SHAP)
- Computing what value to color each polygon based on the current mode
- Passing heatmap data and summary data up to `App.jsx` via callbacks

State for which community is selected on which tab is managed by `mapFacesReducer` in `src/lib/mapFacesReducer.js`. Each mode (source, relation, instance, target, actual, error) has its own independent layer and selected community ID, so switching tabs does not reset or bleed selections across modes.

### MapBoxMap.jsx

A wrapper around MapboxGL. Renders community, beat, or district boundary polygons as a fill layer. Colors them based on the `counts` prop passed from `MapPanel`. Fires selection and hover events back up to the parent.

### ClusterHeatmap.jsx

Renders a D3-based heatmap showing values across all 77 communities over time, with hierarchical clustering (dendrogram) on both axes. Clustering groups communities or dates with similar patterns next to each other. Users can click branches of the dendrogram to select groups of communities, which then drives the temporal line charts shown below the heatmap.

The component handles three different data shapes depending on the active mode:
- **Source/Past mode** — flat array of `{ id, date, count }` objects
- **Model Level / Data Level modes** — 2D array (77 communities × N days)
- **Instance Level / SHAP mode** — 2D array (77 communities × 90 history days)

### SidePanel.jsx

Sits on the right side of the screen. Displays summary statistics for the currently selected community on either map — total crimes, average per day, crime type breakdown, and a small daily line chart for left-map (past) selections, or a time series forecast/actual/error chart for right-map selections.

### src/hooks/

All data fetching uses a `useApi` hook that wraps fetch calls with an `AbortController`, canceling in-flight requests when dependencies change. The specific hooks are:

| Hook | What it fetches |
|---|---|
| `useApi` | Generic fetch wrapper with abort support |
| `useModelRelationCounts` | MI or SAGE attribution for a selected community |
| `useInstanceRelationCounts` | Instance-level MI for a source community |
| `useInstanceShapCounts` | Live SHAP values → per-community attribution matrix |
| `useHoverDailySeries` | Daily time series shown in the hover tooltip |
| `useClusterDailySeries` | Daily series for communities selected via the dendrogram |
| `useValueBounds` | Global min/max for MI and SAGE tensors (used for color scaling) |

### src/lib/

Shared utilities used across components and hooks:

| File | Purpose |
|---|---|
| `api.js` | All API call definitions — one function per endpoint |
| `colors.js` | Color stop arrays for all map and heatmap scales |
| `dates.js` | Date arithmetic (anchor windows, ISO formatting, range helpers) |
| `crimeAggregates.js` | Helpers for filling date gaps in daily series data |
| `boundaries.js` | GeoJSON boundary data references |
| `mapFacesReducer.js` | Reducer managing per-tab map layer and selection state |
| `relationTargets.js` | Converts tensor target arrays to community-ID-keyed maps |
| `indexById.js` | Utility to index arrays by their ID field |

---

## 11. Backend Structure

The backend is a **FastAPI** application. All routes are registered under the `/api` prefix in `backend/main.py`. Route files are kept thin — they parse query parameters, call into service or utility functions, and format responses. The heavy logic lives in `backend/prediction/`.

### Route Files (`backend/routes/`)

| File | Endpoints | Data source |
|---|---|---|
| `predictions.py` | `/predictions/by-date`, `/predictions/instance-shap`, `/map/predictions`, `/predictions/anchor-bounds` | CSV |
| `modelLevelRelation.py` | `/model_level_relation` | MI tensor file |
| `sageLevelRelation.py` | `/model_level_sage`, `/instance_level_sage` | SAGE tensor file |
| `instanceLevelRelation.py` | `/instance_level_relation` | MI tensor file |
| `map.py` | `/map/counts`, `/map/counts/pivot` | DB / CSV |
| `selectionDaily.py` | `/selection-daily` | DB |
| `selectionAllDaily.py` | `/selection-all-daily` | DB |
| `selectionDailyCsv.py` | `/selection-daily-csv`, `/selection-all-daily-csv` | CSV |
| `selectionSummary.py` | `/selection-summary` | DB |
| `valueBounds.py` | `/value-bounds` | MI + SAGE tensor files |
| `heatMap.py` | `/heatmap` | DB |
| `data4d.py` | `/data4d` | MI / SAGE tensor files |
| `health.py` | `/health` | — |
| `dateRange.py` | `/date-range` | DB |

### backend/prediction/ (Research Team Code)

This folder was written by the research team. The student team made targeted edits to `service.py` when needed to wire up specific API behaviors, but the core logic belongs to the research team. Do not modify this folder without fully understanding the prediction pipeline first.

| File | Purpose |
|---|---|
| `service.py` | Core prediction service — builds history matrices, runs inference, computes SHAP |
| `data_source.py` | Loads and caches the CSV pivot file; builds dense history matrices |
| `runtime.py` | Loads model checkpoints from disk; handles multiple checkpoint formats |
| `windowing.py` | Date math for history and forecast windows |
| `config.py` | File paths, device selection, and fixed model constants |
| `schemas.py` | Dataclasses for typed API results |
| `models/` | PyTorch model class definitions (Transformer, iTransformer, etc.) |

---

## 12. The Prediction Pipeline

When a user selects an anchor date and views the Predicted right map, here is what happens end to end:

1. **Frontend** calls `GET /api/predictions/by-date?date=YYYY-MM-DD&model=Transformer`
2. **Backend** reads 90 days of crime history ending on the anchor date from the CSV pivot file, building a `(90, 77)` numpy array — 90 days × 77 communities
3. The array is standardized using the model's scaler (`scaler.npz` — per-community mean and standard deviation)
4. The model runs inference and produces a `(30, 77)` forecast — 30 future days × 77 communities
5. The forecast is de-standardized back to crime count scale
6. The response returns `forecast_daily` (30×77) and `forecast_totals` (77 summed community values)
7. **Frontend** colors the right map by summing each community's forecast over the selected future window

### Anchor Date Constraints

The earliest valid anchor date is `data_min + 89 days` because the model needs 90 days of history before it can run. The latest is the last date in the CSV. The frontend fetches these bounds from `/api/predictions/anchor-bounds` on load and clamps the date picker to that range.

### Model Artifacts

Each model lives in a folder under `models/`. Two variants are currently available — Transformer and iTransformer:

```
models/
├── Transformer/
│   ├── checkpoint/
│   │   ├── checkpoint.pth          # PyTorch model weights
│   │   ├── model_config.json       # Architecture config (seq_len=90, pred_len=30, enc_in=77 ...)
│   │   └── scaler.npz              # Per-community mean and std  (shape: 77,)
│   ├── mi/
│   │   └── mi_input_output.npy     # MI tensor  (shape: 90×77×30×77)
│   └── sage/
│       └── sage_4d_history_source_horizon_target.npy   # SAGE tensor (same shape)
└── iTransformer/
    └── (same structure)
```

The `PRED_MODELS_DIR` environment variable controls the root path for this folder.

---

## 13. AI Attribution Methods

### SHAP (Instance Level — Target Mode)

SHAP (SHapley Additive exPlanations) answers: *for this specific prediction, how much did each input contribute?*

In this application, the inputs are the 90 days × 77 community crime counts fed into the model. The SHAP output is a `(90, 77)` matrix — one value per history day per source community. The frontend sums these across days to produce one value per community for the map.

SHAP is computed live using `shap.KernelExplainer`. It works by comparing the model's output on the actual input against a background sample (a different day's history used as a neutral baseline), then distributing the difference across all inputs using Shapley values from cooperative game theory.

The forecast horizon explained by SHAP is derived from the midpoint of the future window slider. If the slider covers days 0–30, SHAP explains the prediction at horizon day 15.

SHAP values are signed: positive means that source community's past crime pushed the prediction up; negative means it pushed it down.

### SAGE (Model Level and Instance Level — Source Mode)

SAGE (Shapley Additive Global importancE) answers: *how much does each source community systematically influence each target community's predictions?*

SAGE values are precomputed offline and stored as a 4D tensor. When queried, the backend slices the tensor over the selected past and future windows, averages across those axes, and returns a 77-element vector — one score per community.

Like SHAP, SAGE values are signed. Positive = amplifying effect on the target's predicted crime. Negative = suppressive effect. The distribution is highly sparse — the vast majority of values are very close to zero.

### MI (Mutual Information — Data Level)

MI answers: *statistically, how related are two communities' crime patterns in the raw data, independent of any model?*

MI is precomputed and stored in the same 4D tensor shape as SAGE. MI values are always non-negative — higher means stronger statistical dependency. Because MI is a property of the data and not the model, the model selector is hidden in Data Level mode. Both Transformer and iTransformer use the same MI files.

---

## 14. The 4D Tensor System

Both MI and SAGE tensors share the same shape: `(90, 77, 30, 77)`. Understanding the axes is essential for working with any backend tensor-slicing code.

```
axis 0: history_lag        — 90 past input days  (index 0 = most recent, index 89 = oldest)
axis 1: source_community   — 77 source areas     (0-indexed: community 1 = index 0)
axis 2: horizon            — 30 forecast days    (index 0 = D+1, index 29 = D+30)
axis 3: target_community   — 77 target areas     (0-indexed: community 1 = index 0)
```

**Target mode query** — all sources → one target:
```python
sliced = arr[past_start:past_days, :, future_start:future_days, :]
matrix = sliced.mean(axis=(0, 2))   # → (77, 77): source × target
row = matrix[:, target_idx]          # → (77,): all sources for this target
```

**Source mode query** — one source → all targets:
```python
row = matrix[source_idx, :]          # → (77,): this source against all targets
```

### Slider → Tensor Index Mapping

The past slider counts forward from the anchor (0 = anchor, 90 = 90 days ago). The tensor counts backward from the anchor (index 0 = most recent). They are inverted. The conversion in `MapPanel.jsx`:

```js
tPastStart = 90 - dPastEnd;    // slider's far-past end → tensor's near-anchor end
tPastDays  = 90 - dPastStart;  // slider's near-anchor end → tensor's far-past end
```

This inversion is a frequent source of bugs. If you change slider behavior, verify the tensor slice is still correct by checking both ends of the range explicitly.

---

## 15. Slider Windowing System

Two range sliders control the time windows used across all maps, charts, and backend queries.

**Past slider** (0–90 days before anchor) controls:
- Which days of historical crime are aggregated for the left map colors
- Which portion of the SAGE/MI tensor is sliced
- Which history days are included in SHAP computation

**Future slider** (0–30 days after anchor) controls:
- Which forecast days are summed for the right map colors
- Which horizon SHAP explains (midpoint of the selected range)
- Which forecast days are included in SAGE/MI tensor slices

Sliders are debounced at **150ms** via `useDebounced` in `MapPanel.jsx`. This prevents firing a burst of API requests while the user drags. The debounced values (`dPastStart`, `dPastEnd`, `dFutureStart`, `dFutureEnd`) are what get sent to the backend; the raw values update the slider position immediately so the UI feels responsive.

A slider value change flows through: raw state → debounced state → tensor index conversion → API query parameters → backend numpy slice. Changes to slider logic must be traced through all four of these steps.

---

## 16. Color Scaling

Different modes use different color scales. All color stop arrays are defined in `src/lib/colors.js` and shared between the map choropleth layer and the cluster heatmap.

| Mode | Scale type | Colors | Domain |
|---|---|---|---|
| Past (crime counts) | Sequential | Yellow → Red | `[0, max]` |
| MI (Data Level) | Sequential | Light blue → Dark green | `[0, max]` |
| SAGE (Model Level) | Diverging symmetric | Red → White → Green | `[-absMax, +absMax]` |
| SHAP (Instance Level) | Diverging symmetric | Red → White → Green | `[-absMax, +absMax]` |

For SAGE and SHAP the domain is **symmetric**. If the maximum value is 56 and the minimum is -0.6, the domain is set to `[-56, 56]`, not `[-0.6, 56]`. This ensures zero always maps to white. Without this, the severely asymmetric distribution of SAGE values (sparse, mostly near zero, with few large positive values) would make the scale visually misleading — nearly everything would appear green even when most values carry almost no signal.

---

## 17. Index System — Critical Detail

This is one of the most common sources of bugs in this codebase. Two indexing systems are in use simultaneously:

| Context | System | Range |
|---|---|---|
| UI display, API responses for maps, DB `community_area` column | **1-based** | 1–77 |
| Tensor axes, numpy arrays, model inputs | **0-based** | 0–76 |

The conversion happens at the boundary. When the frontend passes a community ID to a tensor endpoint it subtracts 1. When the backend returns tensor results the frontend adds 1 to display them.

Whenever you write code that reads from a tensor or passes a community ID to a tensor-backed endpoint, stop and verify which system you are in. Getting it wrong produces values silently off by one community — a subtle bug that is nearly impossible to catch visually because communities are not labeled on the map by default.

---

## 18. Key Design Decisions

**Why two data sources (DB vs CSV)?**
The model was trained on smoothed CSV data. Feeding it raw DB counts at inference time would be inconsistent with training. Likewise, showing the "actual" line in a time series chart using raw DB counts while the "predicted" line comes from a model trained on CSV creates an unfair comparison between two different distributions. The CSV is used wherever consistency with the model matters; the DB is used for the historical past view where raw accuracy is more important than model consistency.

**Why is the past map still on the DB?**
The left (past) map is showing real historical crime — not model inputs. For that purpose the raw DB records are the most accurate and complete source. The CSV is smoothed and would give a slightly different picture of historical crime that is harder to interpret as ground truth.

**Why is the SAGE/SHAP color scale symmetric?**
SAGE values are extremely sparse. If the scale used the actual data minimum (often nearly zero or only slightly negative), the white center point would sit near the very bottom of the scale, making nearly everything appear green regardless of actual values. The symmetric domain `[-absMax, +absMax]` sacrifices resolution on the negative side to preserve the correct visual interpretation: white means no influence, red means suppression, green means amplification.

**Why debounce the sliders?**
Each slider change can trigger simultaneous API calls to multiple endpoints (MI/SAGE tensor, SHAP, crime counts, predictions). Without debouncing, dragging a slider rapidly would fire dozens of redundant overlapping requests. The 150ms debounce means calls only fire once the user pauses.

**Why use AbortController in all hooks?**
When a dependency changes — for example, the user selects a different community — the previous request is no longer relevant. Without cancellation, a slow response from a previous selection can arrive after the new request has already returned, overwriting the correct data with stale data. AbortController prevents this.

**Why is there a `mapFacesReducer`?**
Each of the six map "faces" (source, relation, instance, target, actual, error) needs to independently remember which boundary layer and which community the user selected in that tab. Without a structured reducer, switching tabs would reset or leak selections across modes. The reducer gives each face its own isolated state that persists when the user switches away and back.

---

## 19. Known Issues

### SHAP values are non-deterministic between calls

SHAP values may differ between clicks even when all inputs are the same. The root cause is that `KernelExplainer` uses a randomly selected background sample — one anchor date chosen from the full dataset as a baseline — and the random number generator is not seeded consistently. Attempts to seed it deterministically did not fully resolve the issue. This is a known limitation of the current interactive SHAP implementation.

### SAGE value sparsity causes collapsed color scales

SAGE values are highly sparse. Approximately 99.4% of values have an absolute value below 0.1, and the median is near zero. When averaged across a time window, the resulting per-community values are often so close to zero that even the symmetric color scale appears mostly white. This is a property of the SAGE values themselves — a mostly white map does not necessarily indicate a bug.

### ~46-day boundary visible in SAGE values

A visible discontinuity appears around the 46-day mark in the SAGE tensor when viewed in the cluster heatmap. Whether this is an artifact of the model architecture or a data processing issue is currently unknown.

### SHAP is slow on CPU

KernelExplainer is not GPU-accelerated. At current interactive settings the computation takes several seconds per request. This is an inherent limitation of live SHAP computation at interactive scale.

---

## 20. Environment & Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PRED_MODELS_DIR` | `<repo_root>/models` | Path to model artifacts folder |
| `PRED_DATA_FALLBACK_CSV` | `<repo_root>/data/Chicago-Data/Crime/crime_1_day_pivot.csv` | Path to smoothed pivot CSV |
| `PRED_DEVICE` | `auto` | Inference device: `auto`, `cpu`, or `cuda` |
| `CORS_ORIGINS` | `http://localhost:5173, http://localhost:3000, http://localhost:8000` | Allowed CORS origins |

### Database

PostgreSQL database named `crime_data` with a single table also named `crime_data`. See `backend/DB_SetUp.md` for the full column schema and the `psql` copy command used to import crime data from CSV.

### Setup
The following was written based on the development environment used by the student team. Tested on Python 3.12.3 and Node v22.22.0.
 
**1. Clone the repository**
```bash
git clone <repo-url>
cd Community-Heatmaps
```
 
**2. Set up the Python virtual environment**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # on Windows: .venv\Scripts\activate
pip install -r requirements.txt
```
 
The `requirements.txt` pulls PyTorch from the PyTorch CUDA 12.4 index (`--extra-index-url https://download.pytorch.org/whl/cu124`). If you are on CPU only and do not need CUDA support, you can remove that line and install the CPU-only torch build instead. Set `PRED_DEVICE=cpu` in your `.env` accordingly.
 
**3. Set up environment variables**
 
Copy the example env file and fill in the required values:
```bash
cp .env.example .env
```
 
Open `.env` and set the following:
 
| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string. Format: `postgresql+psycopg2://user:password@localhost:5432/crime_data` |
| `VITE_MAPBOX_ACCESS_TOKEN` | No | Mapbox token for the Streets map style. Without it the map falls back to OpenStreetMap. |
| `CORS_ORIGINS` | No | Comma-separated allowed origins. Defaults to `http://localhost:5173, http://localhost:3000, http://localhost:8000`. |
| `PRED_MODELS_DIR` | No | Absolute path to the `models/` folder. Defaults to `<repo_root>/models`. |
| `PRED_DATA_FALLBACK_CSV` | No | Absolute path to the pivot CSV. Defaults to `<repo_root>/data/Chicago-Data/Crime/crime_1_day_pivot.csv`. |
| `PRED_DEVICE` | No | Inference device: `auto`, `cpu`, or `cuda`. Defaults to `auto`. |
 
**4. Set up the database**
 
Create a PostgreSQL database named `crime_data` and import the crime data using the command in `backend/DB_SetUp.md`. You will need PostgreSQL installed and running locally. The import command uses `psql` and points to the crime CSV in `data/Chicago-Data/Crime/`.
 
**5. Install frontend dependencies**
```bash
cd ..          # back to repo root
npm install
```
 
**6. Start the backend**
```bash
cd backend
source .venv/bin/activate        # if not already active
uvicorn backend.main:app --reload
```
 
The backend runs on `http://localhost:8000` by default. Visit `http://localhost:8000/docs` to verify all routes are registered and browse the interactive API docs.
 
**7. Start the frontend**
```bash
# in a separate terminal, from the repo root
npm run dev
```
 
The frontend runs on `http://localhost:5173` by default. Vite proxies all `/api` requests to the backend so both need to be running simultaneously.