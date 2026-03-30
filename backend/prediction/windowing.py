from __future__ import annotations

from datetime import date, timedelta


def history_window(anchor_date: date, seq_len: int = 90) -> tuple[date, date]:
    """Inclusive start, exclusive end for SQL/array slicing."""
    if seq_len <= 0:
        raise ValueError("seq_len must be positive")
    start = anchor_date - timedelta(days=seq_len - 1)
    end_exclusive = anchor_date + timedelta(days=1)
    return start, end_exclusive


def forecast_window(anchor_date: date, pred_len: int = 30) -> tuple[date, date]:
    """Inclusive start (D+1), exclusive end (D+1+pred_len)."""
    if pred_len <= 0:
        raise ValueError("pred_len must be positive")
    start = anchor_date + timedelta(days=1)
    end_exclusive = start + timedelta(days=pred_len)
    return start, end_exclusive


def history_dates(anchor_date: date, seq_len: int = 90) -> list[date]:
    start, _ = history_window(anchor_date, seq_len)
    return [start + timedelta(days=i) for i in range(seq_len)]


def forecast_dates(anchor_date: date, pred_len: int = 30) -> list[date]:
    start, _ = forecast_window(anchor_date, pred_len)
    return [start + timedelta(days=i) for i in range(pred_len)]
