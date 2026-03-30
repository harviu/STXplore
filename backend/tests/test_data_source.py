from datetime import date
from unittest.mock import patch

import numpy as np

from backend.prediction.data_source import build_dense_history_matrix, get_daily_rows


def test_dense_history_matrix_zero_fills_missing_values():
    history_days = [date(2025, 1, 1), date(2025, 1, 2), date(2025, 1, 3)]
    rows = [
        (date(2025, 1, 1), 1, 5.0),
        (date(2025, 1, 3), 2, 7.0),
    ]

    matrix = build_dense_history_matrix(rows, history_days, community_ids=(1, 2))
    expected = np.array(
        [
            [5.0, 0.0],
            [0.0, 0.0],
            [0.0, 7.0],
        ],
        dtype=np.float32,
    )
    np.testing.assert_allclose(matrix, expected)


def test_db_failure_falls_back_to_csv():
    with (
        patch("backend.prediction.data_source._query_daily_rows_from_db", side_effect=RuntimeError("db down")),
        patch("backend.prediction.data_source._query_daily_rows_from_csv", return_value=[(date(2025, 1, 1), 1, 1.0)]),
    ):
        rows, source = get_daily_rows(date(2025, 1, 1), date(2025, 1, 2), db=object())

    assert source == "csv"
    assert rows == [(date(2025, 1, 1), 1, 1.0)]
