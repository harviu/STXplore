from datetime import date
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
