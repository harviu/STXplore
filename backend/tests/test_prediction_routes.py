from datetime import date, timedelta
from unittest.mock import patch

import numpy as np
from fastapi import HTTPException

from backend.prediction.schemas import InstanceShapResult, MapPredictionResult, PredictionResult
from backend.prediction.service import build_community_masked_histories, build_daily_masked_histories
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


def _instance_result(level: str) -> InstanceShapResult:
    values = (
        np.arange(77, dtype=np.float32)
        if level == "community"
        else np.arange(90, dtype=np.float32)
    )
    return InstanceShapResult(
        model_name="GRU",
        anchor_date=date(2025, 1, 31),
        target_date=date(2025, 2, 1),
        target_horizon=1,
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
    with patch("backend.routes.predictions.prediction_service.explain_instance_shap", return_value=(result, "parquet")):
        out = instance_shap(
            date="2025-01-31",
            model="GRU",
            horizon=1,
            target_community=7,
            explanation_level="community",
            source_community=None,
            samples=256,
            background_size=4,
            seed=0,
        )

    assert out["explanation_level"] == "community"
    assert len(out["community_values"]) == 77
    assert out["history_values"] is None


def test_instance_shap_history_response_has_one_90_day_source_series():
    result = _instance_result("history")
    with patch("backend.routes.predictions.prediction_service.explain_instance_shap", return_value=(result, "parquet")):
        out = instance_shap(
            date="2025-01-31",
            model="GRU",
            horizon=1,
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
