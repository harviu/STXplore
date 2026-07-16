from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import duckdb


ROOT_DIR = Path(__file__).resolve().parents[2]
CRIME_AGGREGATES_PATH = Path(
    os.getenv(
        "CRIME_AGGREGATES_PATH",
        ROOT_DIR / "data" / "derived" / "crime_daily.parquet",
    )
).expanduser().resolve()

LAYER_COLUMNS = {
    "community": "community",
    "community_area": "community",
    "beat": "beat",
    "district": "district",
}


class CrimeAnalytics:
    """Read-only query service over the pre-aggregated crime Parquet file."""

    def __init__(self, parquet_path: Path = CRIME_AGGREGATES_PATH):
        self.parquet_path = parquet_path

    def _require_data(self) -> None:
        if not self.parquet_path.is_file():
            raise FileNotFoundError(
                f"Crime aggregate file not found: {self.parquet_path}. "
                "Run `python -m backend.scripts.build_crime_aggregates`."
            )

    def query(self, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
        self._require_data()
        with duckdb.connect() as connection:
            cursor = connection.execute(sql, [str(self.parquet_path), *(params or [])])
            columns = [item[0] for item in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]

    def one(self, sql: str, params: list[Any] | None = None) -> dict[str, Any]:
        rows = self.query(sql, params)
        if not rows:
            raise RuntimeError("Analytics query returned no rows")
        return rows[0]

    def health(self) -> None:
        self.one("SELECT 1 AS ok FROM read_parquet(?) LIMIT 1")

    def date_range(self) -> dict[str, Any]:
        return self.one(
            """
            SELECT strftime(MIN(day), '%Y-%m-%d') AS min_date,
                   strftime(MAX(day), '%Y-%m-%d') AS max_date
            FROM read_parquet(?)
            """
        )

    def totals(self, layer: str, start: str, end: str) -> list[dict[str, Any]]:
        stored_layer = LAYER_COLUMNS[layer]
        return self.query(
            """
            SELECT feature_id, CAST(SUM(count) AS BIGINT) AS count
            FROM read_parquet(?)
            WHERE layer = ? AND day >= CAST(? AS DATE) AND day < CAST(? AS DATE)
            GROUP BY feature_id
            ORDER BY TRY_CAST(feature_id AS INTEGER), feature_id
            """,
            [stored_layer, start, end],
        )

    def selection_summary(
        self, layer: str, feature_id: str, start: str, end: str
    ) -> tuple[int, list[dict[str, Any]]]:
        stored_layer = LAYER_COLUMNS[layer]
        params = [stored_layer, feature_id, start, end]
        total = self.one(
            """
            SELECT CAST(COALESCE(SUM(count), 0) AS BIGINT) AS total
            FROM read_parquet(?)
            WHERE layer = ? AND feature_id = ?
              AND day >= CAST(? AS DATE) AND day < CAST(? AS DATE)
            """,
            params,
        )["total"]
        top_types = self.query(
            """
            SELECT primary_type, CAST(SUM(count) AS BIGINT) AS count
            FROM read_parquet(?)
            WHERE layer = ? AND feature_id = ?
              AND day >= CAST(? AS DATE) AND day < CAST(? AS DATE)
            GROUP BY primary_type
            ORDER BY count DESC, primary_type
            LIMIT 10
            """,
            params,
        )
        return int(total), top_types

    def daily(
        self, layer: str, feature_id: str, start: str, end: str
    ) -> list[dict[str, Any]]:
        return self.query(
            """
            SELECT strftime(day, '%Y-%m-%d') AS date,
                   CAST(SUM(count) AS BIGINT) AS count
            FROM read_parquet(?)
            WHERE layer = ? AND feature_id = ?
              AND day >= CAST(? AS DATE) AND day < CAST(? AS DATE)
            GROUP BY day
            ORDER BY day
            """,
            [LAYER_COLUMNS[layer], feature_id, start, end],
        )

    def all_daily(self, layer: str, start: str, end: str) -> list[dict[str, Any]]:
        return self.query(
            """
            SELECT feature_id AS id, strftime(day, '%Y-%m-%d') AS date,
                   CAST(SUM(count) AS BIGINT) AS count
            FROM read_parquet(?)
            WHERE layer = ? AND day >= CAST(? AS DATE) AND day < CAST(? AS DATE)
            GROUP BY feature_id, day
            ORDER BY day, TRY_CAST(feature_id AS INTEGER), feature_id
            """,
            [LAYER_COLUMNS[layer], start, end],
        )


crime_analytics = CrimeAnalytics()


def normalize_feature_id(layer: str, feature_id: str) -> str:
    if layer == "beat":
        try:
            return str(int(feature_id))
        except ValueError:
            return feature_id.lstrip("0") or "0"
    return feature_id
