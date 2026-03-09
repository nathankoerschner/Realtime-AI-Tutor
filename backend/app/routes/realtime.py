from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.openai_sessions import OpenAISessionError, create_realtime_session

router = APIRouter(prefix="/api/realtime", tags=["realtime"])


class SessionRequest(BaseModel):
    topic_hint: str | None = None
    student_level: str | None = None


@router.post("/session")
async def create_session(payload: SessionRequest) -> dict:
    try:
        return await create_realtime_session(payload.topic_hint, payload.student_level)
    except OpenAISessionError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
