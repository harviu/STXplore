from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np


@dataclass(frozen=True)
class TensorSample:
    x_enc: np.ndarray
    x_mark_enc: np.ndarray | None
    x_dec: np.ndarray
    x_mark_dec: np.ndarray | None


@dataclass(frozen=True)
class PredictionResult:
    model_name: str
    anchor_date: date
    history_dates: list[date]
    forecast_dates: list[date]
    forecast_daily: np.ndarray  # [pred_len, 77]
    forecast_totals: np.ndarray  # [77]


@dataclass(frozen=True)
class MapPredictionResult:
    layer: str
    start: date
    end_exclusive: date
    model_name: str
    totals: np.ndarray
