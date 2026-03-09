from __future__ import annotations

from typing import Any

import httpx

from app.config import OPENAI_API_KEY, OPENAI_REALTIME_MODEL, TUTOR_INSTRUCTIONS

OPENAI_REALTIME_SESSIONS_URL = "https://api.openai.com/v1/realtime/sessions"


class OpenAISessionError(RuntimeError):
    pass


async def create_realtime_session(topic_hint: str | None = None, student_level: str | None = None) -> dict[str, Any]:
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
        "temperature": 0.7,
    }

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(OPENAI_REALTIME_SESSIONS_URL, headers=headers, json=payload)

    if response.is_error:
        raise OpenAISessionError(f"OpenAI session creation failed: {response.status_code} {response.text}")

    data = response.json()
    data["session_config"] = payload
    return data
