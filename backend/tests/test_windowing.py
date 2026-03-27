from datetime import date

from backend.prediction.windowing import forecast_dates, forecast_window, history_dates, history_window


def test_history_window_includes_anchor_day():
    anchor = date(2025, 1, 31)
    start, end_exclusive = history_window(anchor, seq_len=90)
    days = history_dates(anchor, seq_len=90)

    assert start == date(2024, 11, 3)
    assert end_exclusive == date(2025, 2, 1)
    assert len(days) == 90
    assert days[0] == start
    assert days[-1] == anchor


def test_forecast_window_next_30_days():
    anchor = date(2025, 1, 31)
    start, end_exclusive = forecast_window(anchor, pred_len=30)
    days = forecast_dates(anchor, pred_len=30)

    assert start == date(2025, 2, 1)
    assert end_exclusive == date(2025, 3, 3)
    assert len(days) == 30
    assert days[0] == start
    assert days[-1] == date(2025, 3, 2)
