from pathlib import Path

import duckdb

from backend.db.analytics import CrimeAnalytics, normalize_feature_id


def _write_fixture(path: Path) -> None:
    with duckdb.connect() as connection:
        connection.execute(
            """
            COPY (
                SELECT * FROM (VALUES
                    (DATE '2025-01-01', 'community', '1', 'THEFT', 2),
                    (DATE '2025-01-01', 'community', '1', 'BATTERY', 1),
                    (DATE '2025-01-02', 'community', '1', 'THEFT', 3),
                    (DATE '2025-01-01', 'beat', '735', 'THEFT', 4),
                    (DATE '2025-01-01', 'district', '7', 'THEFT', 4)
                ) AS t(day, layer, feature_id, primary_type, count)
            ) TO ? (FORMAT PARQUET)
            """,
            [str(path)],
        )


def test_analytics_preserves_route_aggregations(tmp_path):
    path = tmp_path / "crime_daily.parquet"
    _write_fixture(path)
    analytics = CrimeAnalytics(path)

    assert analytics.totals("community_area", "2025-01-01", "2025-01-03") == [
        {"feature_id": "1", "count": 6}
    ]
    total, top_types = analytics.selection_summary(
        "community", "1", "2025-01-01", "2025-01-03"
    )
    assert total == 6
    assert top_types == [
        {"primary_type": "THEFT", "count": 5},
        {"primary_type": "BATTERY", "count": 1},
    ]
    assert analytics.daily("community", "1", "2025-01-01", "2025-01-03") == [
        {"date": "2025-01-01", "count": 3},
        {"date": "2025-01-02", "count": 3},
    ]


def test_normalize_zero_padded_beat():
    assert normalize_feature_id("beat", "0735") == "735"
