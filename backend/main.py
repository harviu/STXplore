import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routes import routers
load_dotenv()

app = FastAPI(title="Crime Data Api", version="0.1.0")

cors = os.getenv("CORS_ORIGINS", "http://localhost:5173, https://localhost:3000")
origins = [o.strip() for o in cors.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root(): # type: ignore
    return {"ok": True, "hint": "Try /api/health or /docs"} # type: ignore


for r in routers:
    app.include_router(r,prefix="/api")