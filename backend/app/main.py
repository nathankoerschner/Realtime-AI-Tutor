from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import APP_ENV, FRONTEND_DIST, OPENAI_REALTIME_MODEL
from app.routes.evals import router as evals_router
from app.routes.realtime import router as realtime_router

app = FastAPI(title="Live AI Video Tutor", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(realtime_router)
app.include_router(evals_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "env": APP_ENV,
        "model": OPENAI_REALTIME_MODEL,
    }


if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str) -> FileResponse:
        requested = FRONTEND_DIST / full_path
        if full_path and requested.exists() and requested.is_file():
            return FileResponse(requested)
        return FileResponse(FRONTEND_DIST / "index.html")
else:
    @app.get("/")
    async def root() -> dict[str, str]:
        return {
            "message": "Frontend build not found. Run the frontend build and serve it through FastAPI.",
            "frontend_dist": str(FRONTEND_DIST),
        }
