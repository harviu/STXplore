from __future__ import annotations

from datetime import date
from typing import Iterable

import numpy as np
import pandas as pd

from backend.prediction.config import COMMUNITY_IDS, PRED_DATA_FALLBACK_CSV


DailyRow = tuple[date, int, float]
_CSV_DAILY_CACHE: pd.DataFrame | None = None


def _load_csv_daily_cache() -> pd.DataFrame:
    global _CSV_DAILY_CACHE
    if _CSV_DAILY_CACHE is not None:
        return _CSV_DAILY_CACHE

    if not PRED_DATA_FALLBACK_CSV.exists():
        raise FileNotFoundError(f"Pivot CSV not found: {PRED_DATA_FALLBACK_CSV}")

    df = pd.read_csv(PRED_DATA_FALLBACK_CSV)
    if "date" not in df.columns:
        raise RuntimeError(f"Pivot CSV must include 'date' column: {PRED_DATA_FALLBACK_CSV}")

    out = pd.DataFrame()
    out["day"] = pd.to_datetime(df["date"], errors="coerce").dt.date
    out = out.dropna(subset=["day"])

    value_cols: list[str] = []
    for community in COMMUNITY_IDS:
        col = str(community)
        if col in df.columns:
            out[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0).astype(float)
        else:
            out[col] = 0.0
        value_cols.append(col)

    grouped = out.groupby("day", as_index=False)[value_cols].sum()
    long_df = grouped.melt(id_vars=["day"], value_vars=value_cols, var_name="community", value_name="count")
    long_df["community"] = long_df["community"].astype(int)
    long_df["count"] = long_df["count"].astype(float)

    _CSV_DAILY_CACHE = long_df.sort_values(["day", "community"]).reset_index(drop=True)
    return _CSV_DAILY_CACHE


def _query_daily_rows_from_csv(start: date, end_exclusive: date) -> list[DailyRow]:
    grouped = _load_csv_daily_cache()
    mask = (grouped["day"] >= start) & (grouped["day"] < end_exclusive)
    filtered = grouped.loc[mask, ["day", "community", "count"]]
    return [(r.day, int(r.community), float(r.count)) for r in filtered.itertuples(index=False)]


def get_daily_rows(start: date, end_exclusive: date, db=None) -> tuple[list[DailyRow], str]:
    return _query_daily_rows_from_csv(start, end_exclusive), "csv_pivot"


def _date_range_from_csv() -> tuple[date, date]:
    grouped = _load_csv_daily_cache()
    if grouped.empty:
        raise RuntimeError("Pivot CSV has no usable community-area rows")
    return grouped["day"].min(), grouped["day"].max()


def get_available_date_range(db=None) -> tuple[date, date, str]:
    min_day, max_day = _date_range_from_csv()
    return min_day, max_day, "csv_pivot"


def build_dense_history_matrix(
    rows: Iterable[DailyRow],
    history_days: list[date],
    community_ids: tuple[int, ...] = COMMUNITY_IDS,
) -> np.ndarray:
    """Build [seq_len, num_communities] with zeros for missing day/community."""
    seq_len = len(history_days)
    n_communities = len(community_ids)
    matrix = np.zeros((seq_len, n_communities), dtype=np.float32)

    day_to_idx = {d: i for i, d in enumerate(history_days)}
    comm_to_idx = {c: i for i, c in enumerate(community_ids)}

    for day, community, count in rows:
        day_idx = day_to_idx.get(day)
        comm_idx = comm_to_idx.get(community)
        if day_idx is None or comm_idx is None:
            continue
        matrix[day_idx, comm_idx] = float(count)

    return matrix
