from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
from sqlalchemy.orm import Session

from backend.prediction.config import COMMUNITY_IDS
from backend.prediction.data_source import (
    build_dense_history_matrix,
    get_available_date_range,
    get_daily_rows,
)
from backend.prediction.runtime import RuntimeRegistry
from backend.prediction.schemas import MapPredictionResult, PredictionResult, TensorSample
from backend.prediction.windowing import forecast_dates, forecast_window, history_dates, history_window


@dataclass(frozen=True)
class InferenceContext:
    model_name: str
    anchor_date: date
    sample: TensorSample
    history_matrix: np.ndarray


class PredictionService:
    def __init__(self):
        self.registry = RuntimeRegistry()

    def _build_history_matrix(self, anchor_date: date, seq_len: int, db: Session | None = None) -> tuple[np.ndarray, list[date], str]:
        hist_days = history_dates(anchor_date, seq_len=seq_len)
        hist_start, hist_end_exclusive = history_window(anchor_date, seq_len=seq_len)
        min_day, max_day, range_source = get_available_date_range(db=db)
        earliest_anchor = min_day + timedelta(days=seq_len - 1)

        if hist_start < min_day:
            raise RuntimeError(
                f"Not enough history for anchor date {anchor_date.isoformat()}; "
                f"earliest supported anchor date is {earliest_anchor.isoformat()}"
            )
        if anchor_date > max_day:
            raise RuntimeError(
                f"Anchor date {anchor_date.isoformat()} is beyond available data max {max_day.isoformat()} ({range_source})"
            )

        rows, source = get_daily_rows(hist_start, hist_end_exclusive, db=db)
        matrix = build_dense_history_matrix(rows, hist_days, community_ids=COMMUNITY_IDS)
        return matrix, hist_days, source

    def predict_by_date(self, anchor_date: date, model_name: str, db: Session | None = None) -> tuple[PredictionResult, str]:
        bundle = self.registry.get(model_name)
        seq_len = int(bundle.cfg["seq_len"])
        pred_len = int(bundle.cfg["pred_len"])

        history_matrix, hist_days, source = self._build_history_matrix(anchor_date, seq_len=seq_len, db=db)
        forecast_daily = bundle.predict(history_matrix, anchor_date)
        forecast_sum = forecast_daily.sum(axis=0).astype(np.float32)

        pred_days = forecast_dates(anchor_date, pred_len=pred_len)
        return (
            PredictionResult(
                model_name=model_name,
                anchor_date=anchor_date,
                history_dates=hist_days,
                forecast_dates=pred_days,
                forecast_daily=forecast_daily,
                forecast_totals=forecast_sum,
            ),
            source,
        )

    def map_prediction(self, anchor_date: date, model_name: str, db: Session | None = None) -> tuple[MapPredictionResult, str]:
        pred, source = self.predict_by_date(anchor_date=anchor_date, model_name=model_name, db=db)
        start, end_exclusive = forecast_window(anchor_date, pred_len=pred.forecast_daily.shape[0])

        return (
            MapPredictionResult(
                layer="community_area",
                start=start,
                end_exclusive=end_exclusive,
                model_name=model_name,
                totals=pred.forecast_totals,
            ),
            source,
        )

    def build_inference_context(self, anchor_date: date, model_name: str, db: Session | None = None) -> InferenceContext:
        bundle = self.registry.get(model_name)
        history_matrix, _, _ = self._build_history_matrix(anchor_date, seq_len=int(bundle.cfg["seq_len"]), db=db)
        sample = bundle.prepare_sample(history_matrix, anchor_date)
        return InferenceContext(
            model_name=model_name,
            anchor_date=anchor_date,
            sample=sample,
            history_matrix=history_matrix,
        )


prediction_service = PredictionService()
