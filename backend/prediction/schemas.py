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


@dataclass(frozen=True)
class InstanceShapResult:
    model_name: str
    anchor_date: date
    target_start_date: date
    target_end_date: date
    target_horizon_start: int  # 1-based, inclusive
    target_horizon_end: int  # 1-based, inclusive
    target_community_id: int  # 1..77
    explanation_level: str  # "community" or "history"
    source_community_id: int | None  # set only for history explanations
    history_dates: list[date]
    prediction: float
    baseline: float
    shap_values: np.ndarray  # [77] for community, [seq_len] for history
    top_features: list[dict[str, float | int | str]]
