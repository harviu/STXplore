from __future__ import annotations

import modal


app = modal.App("stxplore-backend")
runtime_data = modal.Volume.from_name("stxplore-runtime-data", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("build-essential", "curl", "libgomp1")
    .pip_install_from_requirements("backend/requirements.txt")
    .env(
        {
            "CRIME_AGGREGATES_PATH": "/runtime/crime_daily.parquet",
            "PRED_MODELS_DIR": "/runtime/models",
            "PRED_DATA_FALLBACK_CSV": "/runtime/crime_1_day_pivot.csv",
            "PRED_DEVICE": "cpu",
            "OMP_NUM_THREADS": "1",
            "MKL_NUM_THREADS": "1",
            "OPENBLAS_NUM_THREADS": "1",
        }
    )
    .add_local_dir("backend", remote_path="/root/backend")
)


@app.function(
    image=image,
    cpu=2,
    memory=4096,
    timeout=300,
    startup_timeout=300,
    volumes={"/runtime": runtime_data},
)
@modal.concurrent(max_inputs=20)
@modal.asgi_app()
def fastapi_app():
    from backend.main import app as web_app

    return web_app
