from __future__ import annotations

import argparse
from pathlib import Path

import duckdb


ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = (
    ROOT_DIR
    / "data"
    / "Chicago-Data"
    / "Crime"
    / "cleaned_Crimes_-_2001_to_Present_20250114.csv"
)
DEFAULT_OUTPUT = ROOT_DIR / "data" / "derived" / "crime_daily.parquet"


def build(source: Path, output: Path) -> None:
    if not source.is_file():
        raise FileNotFoundError(f"Source CSV not found: {source}")

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary_output = output.with_suffix(".parquet.tmp")
    temporary_output.unlink(missing_ok=True)

    connection = duckdb.connect()
    try:
        connection.execute(
            """
            COPY (
                WITH incidents AS (
                    SELECT
                        CAST("date" AS DATE) AS day,
                        primary_type,
                        CAST(TRY_CAST(community_area AS INTEGER) AS VARCHAR) AS community,
                        CAST(TRY_CAST(beat AS INTEGER) AS VARCHAR) AS beat,
                        CAST(TRY_CAST(district AS INTEGER) AS VARCHAR) AS district
                    FROM read_csv(?, header = true, all_varchar = true)
                    WHERE "date" IS NOT NULL AND primary_type IS NOT NULL
                ), layered AS (
                    SELECT day, 'community' AS layer, community AS feature_id, primary_type
                    FROM incidents WHERE community IS NOT NULL
                    UNION ALL
                    SELECT day, 'beat' AS layer, beat AS feature_id, primary_type
                    FROM incidents WHERE beat IS NOT NULL
                    UNION ALL
                    SELECT day, 'district' AS layer, district AS feature_id, primary_type
                    FROM incidents WHERE district IS NOT NULL
                )
                SELECT day, layer, feature_id, primary_type, COUNT(*)::UINTEGER AS count
                FROM layered
                GROUP BY day, layer, feature_id, primary_type
                ORDER BY layer, day, TRY_CAST(feature_id AS INTEGER), primary_type
            ) TO ? (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 100000)
            """,
            # DuckDB binds the COPY destination before parameters in its SELECT.
            [str(temporary_output), str(source)],
        )
    finally:
        connection.close()

    temporary_output.replace(output)

    with duckdb.connect() as check:
        row_count, incident_count, min_day, max_day = check.execute(
            """
            SELECT COUNT(*), SUM(count), MIN(day), MAX(day)
            FROM read_parquet(?)
            """,
            [str(output)],
        ).fetchone()

    print(f"Wrote {output}")
    print(f"Aggregate rows: {row_count:,}")
    print(f"Layered incident count: {incident_count:,}")
    print(f"Date range: {min_day} through {max_day}")
    print(f"Size: {output.stat().st_size / (1024 * 1024):.1f} MiB")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Aggregate the raw Chicago crime CSV into runtime Parquet data."
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    build(args.source.expanduser().resolve(), args.output.expanduser().resolve())


if __name__ == "__main__":
    main()
