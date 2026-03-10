from __future__ import annotations

import time
from typing import Any

import httpx

from app.config import OPENAI_API_KEY, OPENAI_REALTIME_MODEL, TUTOR_INSTRUCTIONS
from app.services.eval_logging import log_eval_event

OPENAI_REALTIME_SESSIONS_URL = "https://api.openai.com/v1/realtime/sessions"


class OpenAISessionError(RuntimeError):
    pass


async def create_realtime_session(
    topic_hint: str | None = None,
    student_level: str | None = None,
    eval_run_id: str | None = None,
) -> dict[str, Any]:
    if not OPENAI_API_KEY:
        raise OpenAISessionError("OPENAI_API_KEY is not configured")

    extra_context: list[str] = []
    if student_level:
        extra_context.append(f"Student level hint: {student_level}.")
    if topic_hint:
        extra_context.append(f"Opening topic hint from UI: {topic_hint}.")

    instructions = TUTOR_INSTRUCTIONS
    if extra_context:
        instructions = f"{instructions}\n\nSession context:\n- " + "\n- ".join(extra_context)

    payload = {
        "model": OPENAI_REALTIME_MODEL,
        "voice": "alloy",
        "modalities": ["text", "audio"],
        "instructions": instructions,
        "input_audio_format": "pcm16",
        "output_audio_format": "pcm16",
        "turn_detection": {
            "type": "server_vad",
            "threshold": 0.5,
            "prefix_padding_ms": 300,
            "silence_duration_ms": 450,
            "create_response": True,
            "interrupt_response": True,
        },
        "input_audio_transcription": {
            "model": "whisper-1",
        },
        "temperature": 0.7,
    }

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    started = time.perf_counter()
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(OPENAI_REALTIME_SESSIONS_URL, headers=headers, json=payload)
    duration_ms = round((time.perf_counter() - started) * 1000, 2)

    log_eval_event(
        "openai_session_metrics",
        {
            "eval_run_id": eval_run_id,
            "url": OPENAI_REALTIME_SESSIONS_URL,
            "model": OPENAI_REALTIME_MODEL,
            "ok": not response.is_error,
            "duration_ms": duration_ms,
            "status_code": response.status_code,
        },
    )

    if response.is_error:
        raise OpenAISessionError(f"OpenAI session creation failed: {response.status_code} {response.text}")

    data = response.json()
    data["session_config"] = payload
    return data
