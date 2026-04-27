# CrimeSight AI

An interactive web dashboard for visualizing historical crime data and exploring AI model predictions across Chicago's 77 community areas. Built for researchers at Grand Valley State University.

---

## What it does

CrimeSight AI lets you:

- Explore historical crime counts across Chicago community areas, police beats, and districts on an interactive map
- View AI model crime forecasts for any date and compare them against what actually happened
- Understand *why* the model made a prediction using attribution methods — SHAP, SAGE, and Mutual Information — that show which communities most influenced a given forecast
- Explore community-level patterns over time using a cluster heatmap with hierarchical grouping

---

## Documentation

Full documentation lives in the `docs/` folder:

- **[Architecture.md](docs/Architecture.md)** — system overview, data sources, visualization modes, frontend and backend structure, key design decisions, known issues, and setup instructions. Start here if you are new to the project.
- **[Code_Reference.md](docs/Code_Reference.md)** — every backend API endpoint with parameters and response shapes, all frontend hooks, and shared utility functions.
- **[prediction-backend-context.md](docs/prediction-backend-context.md)** — technical details about the prediction backend written by the research team, covering the API contract, data source behavior, model artifact format, and SHAP implementation notes.
- **[DB_SetUp.md](backend/DB_SetUp.md)** — (Lives in backend/ not docs/) database schema and import command

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, MapboxGL, D3.js |
| Backend | Python, FastAPI, SQLAlchemy |
| Database | PostgreSQL |
| AI/ML | PyTorch (Transformer, iTransformer), SHAP, SAGE, Mutual Information |

---

## Quick Start

Full setup instructions are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#20-environment--configuration). The short version:

```bash
# 1. Install frontend dependencies
npm install

# 2. Set up Python virtual environment
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 3. Configure environment variables
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL

# 4. Set up the database
# See backend/DB_SetUp.md for schema and import command

# 5. Start the backend (from backend/)
uvicorn backend.main:app --reload

# 6. Start the frontend (from repo root, separate terminal)
npm run dev
```

The frontend runs at `http://localhost:5173`. The backend runs at `http://localhost:8000`. Interactive API docs are available at `http://localhost:8000/docs`.

---

## Project Structure

```
Community-Heatmaps/
├── backend/          # FastAPI backend — routes, DB layer, prediction pipeline
├── data/             # Crime data CSV and boundary GeoJSON files
├── docs/             # Project documentation
├── models/           # AI model checkpoints and precomputed attribution tensors
├── src/              # React frontend — components, hooks, utilities
└── public/           # Static assets
```

---

## Who built what

The student development team built the frontend, all backend routes, and the database layer. The research team contributed the AI model, prediction pipeline, and precomputed attribution tensors (`backend/prediction/`, `models/`, `data/`).