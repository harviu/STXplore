from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query

from backend.prediction.config import SEQ_LEN
from backend.prediction.data_source import get_available_date_range
from backend.prediction.service import prediction_service
from backend.prediction.windowing import forecast_window, history_window


router = APIRouter(tags=["predictions"])


def _parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD") from exc


@router.get("/predictions/anchor-bounds")
def predictions_anchor_bounds() -> dict:  # type: ignore
    """Anchor dates valid for prediction, based on the model-training pivot CSV."""
    try:
        min_day, max_day, source = get_available_date_range()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    anchor_min = min_day + timedelta(days=SEQ_LEN - 1)
    return {
        "data_min": min_day.isoformat(),
        "data_max": max_day.isoformat(),
        "anchor_min": anchor_min.isoformat(),
        "anchor_max": max_day.isoformat(),
        "seq_len": SEQ_LEN,
        "source": source,
    }


@router.get("/predictions/by-date")
def predictions_by_date(  # type: ignore
    date: str = Query(..., description="Anchor date in YYYY-MM-DD"),
    model: str = Query(..., description="Model folder name under Community-Heatmaps/models"),
):
    anchor_date = _parse_date(date)

    try:
        result, source = prediction_service.predict_by_date(anchor_date=anchor_date, model_name=model)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    hist_start, hist_end_exclusive = history_window(anchor_date, seq_len=len(result.history_dates))
    pred_start, pred_end_exclusive = forecast_window(anchor_date, pred_len=len(result.forecast_dates))

    forecast_daily = [
        {
            "date": d.isoformat(),
            "values": result.forecast_daily[i, :].astype(float).tolist(),
        }
        for i, d in enumerate(result.forecast_dates)
    ]

    totals = [
        {
            "feature_id": str(i + 1),
            "count": float(v),
        }
        for i, v in enumerate(result.forecast_totals)
    ]

    return {
        "model": result.model_name,
        "date": result.anchor_date.isoformat(),
        "history_start": hist_start.isoformat(),
        "history_end": result.history_dates[-1].isoformat(),
        "history_end_exclusive": hist_end_exclusive.isoformat(),
        "forecast_start": pred_start.isoformat(),
        "forecast_end": result.forecast_dates[-1].isoformat(),
        "forecast_end_exclusive": pred_end_exclusive.isoformat(),
        "source": source,
        "forecast_daily": forecast_daily,
        "forecast_totals": totals,
    }


@router.get("/map/predictions")
def map_predictions(  # type: ignore
    layer: str = Query(..., description="community_area only in v1"),
    date: str = Query(..., description="Anchor date in YYYY-MM-DD"),
    model: str = Query(..., description="Model folder name under Community-Heatmaps/models"),
):
    if layer != "community_area":
        raise HTTPException(status_code=400, detail="Prediction map supports layer=community_area only in v1")

    anchor_date = _parse_date(date)

    try:
        result, source = prediction_service.map_prediction(anchor_date=anchor_date, model_name=model)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    data = [
        {
            "feature_id": str(i + 1),
            "count": float(v),
        }
        for i, v in enumerate(result.totals)
    ]

    return {
        "layer": result.layer,
        "start": result.start.isoformat(),
        "end": result.end_exclusive.isoformat(),
        "model": result.model_name,
        "source": source,
        "data": data,
    }


@router.get("/predictions/instance-shap")
def instance_shap(  # type: ignore
    date: str = Query(..., description="Anchor date in YYYY-MM-DD"),
    model: str = Query(..., description="Model folder name under Community-Heatmaps/models"),
    horizon: int = Query(..., ge=1, description="1-based forecast horizon (1..30)"),
    target_community: int = Query(..., ge=1, le=77, description="Community ID in 1..77"),
):
    anchor_date = _parse_date(date)

    try:
        result, source = prediction_service.explain_instance_shap(
            anchor_date=anchor_date,
            model_name=model,
            target_horizon=horizon,
            target_community_id=target_community,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    shap_by_day = [
        {
            "date": d.isoformat(),
            "values": result.shap_values[i, :].astype(float).tolist(),
        }
        for i, d in enumerate(result.history_dates)
    ]

    return {
        "model": result.model_name,
        "date": result.anchor_date.isoformat(),
        "target_date": result.target_date.isoformat(),
        "horizon": result.target_horizon,
        "target_community": result.target_community_id,
        "source": source,
        "prediction": float(result.prediction),
        "baseline": float(result.baseline),
        "shap_sum": float(result.shap_values.sum()),
        "approx_error": float(result.prediction - result.baseline - result.shap_values.sum()),
        "history_start": result.history_dates[0].isoformat(),
        "history_end": result.history_dates[-1].isoformat(),
        "top_features": result.top_features,
        "shap_values": shap_by_day,
    }
