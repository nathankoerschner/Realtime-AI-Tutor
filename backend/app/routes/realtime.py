from __future__ import annotations

import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.eval_logging import log_eval_event
from app.services.openai_sessions import OpenAISessionError, create_realtime_session
from app.services.transcript_normalization import (
    TranscriptNormalizationError,
    normalize_transcript_to_english,
)

router = APIRouter(prefix="/api/realtime", tags=["realtime"])


class SessionRequest(BaseModel):
    topic_hint: str | None = None
    student_level: str | None = None
    eval_run_id: str | None = None


class TranscriptNormalizationRequest(BaseModel):
    transcript: str


@router.post("/session")
async def create_session(payload: SessionRequest) -> dict:
    started = time.perf_counter()
    try:
        data = await create_realtime_session(payload.topic_hint, payload.student_level, payload.eval_run_id)
        log_eval_event(
            "backend_session_metrics",
            {
                "eval_run_id": payload.eval_run_id,
                "route": "/api/realtime/session",
                "ok": True,
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                "topic_hint": payload.topic_hint,
                "student_level": payload.student_level,
            },
        )
        return data
    except OpenAISessionError as exc:
        log_eval_event(
            "backend_session_metrics",
            {
                "eval_run_id": payload.eval_run_id,
                "route": "/api/realtime/session",
                "ok": False,
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                "topic_hint": payload.topic_hint,
                "student_level": payload.student_level,
                "error": str(exc),
            },
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/normalize-transcript")
async def normalize_transcript(payload: TranscriptNormalizationRequest) -> dict[str, str]:
    try:
        return {"transcript": await normalize_transcript_to_english(payload.transcript)}
    except TranscriptNormalizationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
