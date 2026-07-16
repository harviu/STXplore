from datetime import date
from unittest.mock import patch

import numpy as np
from fastapi import HTTPException

from backend.prediction.schemas import MapPredictionResult, PredictionResult
from backend.prediction.service import distribute_group_shap
from backend.routes.predictions import map_predictions, predictions_anchor_bounds, predictions_by_date


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


def test_group_shap_distribution_preserves_community_totals():
    query = np.array([[1.0, 2.0], [3.0, 2.0]], dtype=np.float32)
    baseline = np.zeros_like(query)
    group_values = np.array([8.0, -4.0], dtype=np.float32)

    distributed = distribute_group_shap(group_values, query, baseline)

    np.testing.assert_allclose(distributed.sum(axis=0), group_values)
    np.testing.assert_allclose(distributed[:, 0], [2.0, 6.0])
    np.testing.assert_allclose(distributed[:, 1], [-2.0, -2.0])
