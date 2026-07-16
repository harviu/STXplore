# Prediction Backend Context
> **Related documents:** [README](../README.md) | [Architecture](ARCHITECTURE.md) | [Code Reference](CODE_REFERENCE.md) | [Database Setup](../backend/DB_SetUp.md)

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

### 3) Instance SHAP explanation (single sample, single target)
`GET /api/predictions/instance-shap?date=YYYY-MM-DD&model=<model_name>&horizon=<1..30>&target_community=<1..77>&explanation_level=<community|history>`

- explains one scalar output:
  - sample chosen by `date`
  - output chosen by (`horizon`, `target_community`)
- response includes:
  - `prediction`, `baseline`, `shap_sum`, `approx_error`
  - community level: `community_values`, 77 source-community attributions
  - history level: `history_values`, 90 direct daily attributions for the required `source_community`
  - `top_features`: top absolute contributors in the selected explanation space

## Data Source Behavior
- Source is CSV-pivot for prediction/explanation APIs.
- Default file path:
  - `data/Chicago-Data/Crime/crime_1_day_pivot.csv`
  - configurable via `PRED_DATA_FALLBACK_CSV`
- CSV format expectation:
  - `date` column
  - community columns `1..77`
  - values are daily counts (or smoothed counts)
- Loader behavior:
  - parses `date` to daily grain
  - coerces community values to numeric
  - missing community columns are filled with `0.0`
  - if multiple rows exist per day, rows are summed
  - caches long-form `(day, community, count)` for fast repeated range access
- Dense history matrix is always `(90, 77)` with zero-fill for missing day/community.

## Model Artifact Contract
`Community-Heatmaps/models/<model_name>/checkpoint/`
- `checkpoint.pth`
- `model_config.json`
- `scaler.npz`

`model_config.json` required fields include:
- model identity and architecture (`model_type`, `d_model`, `d_ff`, `e_layers`, `d_layers`, `n_heads`, etc.)
- fixed dimensions (`seq_len=90`, `label_len=45`, `pred_len=30`, `enc_in=77`, `dec_in=77`, `c_out=77`)

`scaler.npz` required arrays:
- `mean` `(77,)`
- `std` `(77,)`
- optional `community_ids` ordered `1..77` (recommended to include explicitly)

## Runtime Checkpoint Loading Notes
- Loader supports common checkpoint wrappers:
  - raw `state_dict`
  - `state_dict` key inside checkpoint payload
  - `model_state_dict` key inside checkpoint payload
- Legacy compatibility:
  - rewrites key pattern `.tokenConv.` to `.token_conv.` for embedding layers
- Extra checkpoint params not present in runtime model (for example `mamba.*`) are filtered out.
- Load fails if required runtime params are still missing after normalization/filtering.

## SHAP Implementation Notes
- Instance SHAP uses `shap.KernelExplainer`, aligned with `shap_ts.py` single-sample kernel mode.
- Background anchors are sampled from all valid anchor dates without replacement using the request seed.
- Request defaults are:
  - `background_size=4`
  - `samples=256`
  - `seed=0`
  - `top_k=20` (internal)
- Time marks stay fixed at the query values and are not attributed.
- Community mode toggles complete community histories. History mode toggles individual days for only the selected source while all other source histories remain actual.
- Decoder input is rebuilt from each sampled `x_enc` (`last label_len + zero future`), matching inference logic.
- Dependency: `shap` must be installed in the backend environment.

## Operational Notes
- Prediction and SHAP endpoints report `source=csv_pivot`.
- Model folders currently prepared in `Community-Heatmaps/models/`:
  - `Transformer`: config/checkpoint/scaler wired
  - `iTransformer`: config/checkpoint/scaler wired
