from datetime import date, timedelta
from unittest.mock import patch

import numpy as np
import torch
from fastapi import HTTPException

from backend.prediction.schemas import InstanceShapResult, MapPredictionResult, PredictionResult
from backend.prediction.service import PredictionService, build_community_masked_histories, build_daily_masked_histories
from backend.routes.predictions import instance_shap, map_predictions, predictions_anchor_bounds, predictions_by_date


def test_predictions_anchor_bounds():
    with patch(
        "backend.routes.predictions.get_available_date_range",
        return_value=(date(2001, 1, 1), date(2024, 12, 31), "csv_pivot"),
    ):
        out = predictions_anchor_bounds()

    assert out["data_min"] == "2001-01-01"
    assert out["data_max"] == "2024-12-31"
    assert out["anchor_min"] == "2001-03-31"
    assert out["anchor_max"] == "2024-12-31"
    assert out["seq_len"] == 90


def test_predictions_by_date_shape():
    pred = PredictionResult(
        model_name="GRU",
        anchor_date=date(2025, 1, 31),
        history_dates=[date(2024, 11, 3)],
        forecast_dates=[date(2025, 2, 1), date(2025, 2, 2)],
        forecast_daily=np.array([[1.0] * 77, [2.0] * 77], dtype=np.float32),
        forecast_totals=np.array([3.0] * 77, dtype=np.float32),
    )

    with patch("backend.routes.predictions.prediction_service.predict_by_date", return_value=(pred, "db")):
        out = predictions_by_date(date="2025-01-31", model="GRU")

    assert out["model"] == "GRU"
    assert out["date"] == "2025-01-31"
    assert len(out["forecast_daily"]) == 2
    assert len(out["forecast_daily"][0]["values"]) == 77
    assert len(out["forecast_totals"]) == 77


def test_map_predictions_rejects_non_community_layer():
    try:
        map_predictions(layer="beat", date="2025-01-31", model="GRU")
        assert False, "Expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 400


def test_map_predictions_shape():
    mp = MapPredictionResult(
        layer="community_area",
        start=date(2025, 2, 1),
        end_exclusive=date(2025, 3, 3),
        model_name="GRU",
        totals=np.array([5.0] * 77, dtype=np.float32),
    )

    with patch("backend.routes.predictions.prediction_service.map_prediction", return_value=(mp, "csv")):
        out = map_predictions(layer="community_area", date="2025-01-31", model="GRU")

    assert out["layer"] == "community_area"
    assert out["start"] == "2025-02-01"
    assert out["end"] == "2025-03-03"
    assert len(out["data"]) == 77


def test_community_masks_toggle_complete_community_histories():
    query = np.array([[1.0, 2.0], [3.0, 4.0]], dtype=np.float32)
    baseline = np.zeros_like(query)
    masks = np.array([[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]], dtype=np.float32)

    histories = build_community_masked_histories(masks, query, baseline)

    np.testing.assert_allclose(histories[0], baseline)
    np.testing.assert_allclose(histories[1, :, 0], query[:, 0])
    np.testing.assert_allclose(histories[1, :, 1], baseline[:, 1])
    np.testing.assert_allclose(histories[2], query)


def test_daily_masks_only_toggle_selected_source_history():
    query = np.array([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]], dtype=np.float32)
    baseline = np.zeros_like(query)
    masks = np.array([[0.0, 0.0, 0.0], [1.0, 0.0, 1.0]], dtype=np.float32)

    histories = build_daily_masked_histories(masks, query, baseline, source_idx=1)

    np.testing.assert_allclose(histories[:, :, 0], np.repeat(query[None, :, 0], 2, axis=0))
    np.testing.assert_allclose(histories[0, :, 1], baseline[:, 1])
    np.testing.assert_allclose(histories[1, :, 1], [2.0, 0.0, 6.0])


def test_kernel_predict_fn_averages_selected_prediction_window():
    class HorizonModel(torch.nn.Module):
        def forward(self, x_enc, _x_mark, _dec_inp, _y_mark):
            batch = x_enc.shape[0]
            # Four prediction days with values 1, 2, 3, 4 for both communities.
            days = torch.arange(1, 5, dtype=x_enc.dtype, device=x_enc.device)
            return days.view(1, 4, 1).repeat(batch, 1, 2)

    predict_fn = PredictionService()._make_kernel_predict_fn(
        model=HorizonModel(),
        device=torch.device("cpu"),
        seq_len=2,
        enc_in=2,
        label_len=1,
        pred_len=4,
        horizon_start_idx=1,
        horizon_end_idx=3,
        community_idx=0,
        include_marks=False,
        mark_dim=0,
        fixed_y_mark=None,
    )

    values = predict_fn(np.zeros((3, 4), dtype=np.float32))
    np.testing.assert_allclose(values, [2.5, 2.5, 2.5])


def _instance_result(level: str) -> InstanceShapResult:
    values = (
        np.arange(77, dtype=np.float32)
        if level == "community"
        else np.arange(90, dtype=np.float32)
    )
    return InstanceShapResult(
        model_name="GRU",
        anchor_date=date(2025, 1, 31),
        target_start_date=date(2025, 2, 1),
        target_end_date=date(2025, 3, 2),
        target_horizon_start=1,
        target_horizon_end=30,
        target_community_id=7,
        explanation_level=level,
        source_community_id=3 if level == "history" else None,
        history_dates=[date(2024, 11, 3) + timedelta(days=i) for i in range(90)],
        prediction=8.0,
        baseline=5.0,
        shap_values=values,
        top_features=[],
    )


def test_instance_shap_community_response_has_map_values_only():
    result = _instance_result("community")
    with patch("backend.routes.predictions.prediction_service.explain_instance_shap", return_value=(result, "parquet")) as explain:
        out = instance_shap(
            date="2025-01-31",
            model="GRU",
            horizon=None,
            horizon_start=1,
            horizon_end=30,
            target_community=7,
            explanation_level="community",
            source_community=None,
            samples=256,
            background_size=4,
            seed=0,
        )

    assert explain.call_args.kwargs["target_horizon"] is None
    assert explain.call_args.kwargs["target_horizon_start"] == 1
    assert explain.call_args.kwargs["target_horizon_end"] == 30
    assert out["explanation_level"] == "community"
    assert out["aggregation"] == "mean"
    assert out["horizon_start"] == 1
    assert out["horizon_end"] == 30
    assert out["horizon"] is None
    assert len(out["community_values"]) == 77
    assert out["history_values"] is None


def test_instance_shap_history_response_has_one_90_day_source_series():
    result = _instance_result("history")
    with patch("backend.routes.predictions.prediction_service.explain_instance_shap", return_value=(result, "parquet")):
        out = instance_shap(
            date="2025-01-31",
            model="GRU",
            horizon=None,
            horizon_start=1,
            horizon_end=30,
            target_community=7,
            explanation_level="history",
            source_community=3,
            samples=256,
            background_size=4,
            seed=0,
        )

    assert out["explanation_level"] == "history"
    assert out["source_community"] == 3
    assert out["community_values"] is None
    assert len(out["history_values"]) == 90
