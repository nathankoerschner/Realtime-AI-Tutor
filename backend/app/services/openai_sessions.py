from __future__ import annotations

import asyncio
import random
import time
from typing import Any

import httpx
from httpx import RequestError

from app.config import OPENAI_API_KEY, OPENAI_REALTIME_MODEL, TUTOR_INSTRUCTIONS
from app.services.eval_logging import log_eval_event

OPENAI_REALTIME_SESSIONS_URL = "https://api.openai.com/v1/realtime/sessions"
OPENAI_REALTIME_CONNECT_TIMEOUT_SECONDS = 1.0
OPENAI_REALTIME_INITIAL_READ_TIMEOUT_SECONDS = 5.0
OPENAI_REALTIME_RETRY_READ_TIMEOUT_SECONDS = 3.0
OPENAI_REALTIME_WRITE_TIMEOUT_SECONDS = 2.0
OPENAI_REALTIME_POOL_TIMEOUT_SECONDS = 1.0
OPENAI_REALTIME_MAX_ATTEMPTS = 3
OPENAI_REALTIME_BACKOFF_BASE_SECONDS = (0.25, 0.75)
OPENAI_REALTIME_RETRY_AFTER_MAX_SECONDS = 2.0
RETRYABLE_STATUS_CODES = {408, 409, 429}


class OpenAISessionError(RuntimeError):
    pass


def _should_retry_response(response: httpx.Response) -> bool:
    return response.status_code in RETRYABLE_STATUS_CODES or response.status_code >= 500


def _retry_delay_seconds(attempt: int, response: httpx.Response | None = None) -> float:
    if response is not None and response.status_code == 429:
        retry_after = response.headers.get("Retry-After")
        if retry_after:
            try:
                return min(float(retry_after), OPENAI_REALTIME_RETRY_AFTER_MAX_SECONDS)
            except ValueError:
                pass

    base_delay = OPENAI_REALTIME_BACKOFF_BASE_SECONDS[attempt - 1]
    return round(random.uniform(base_delay, base_delay + 0.5), 3)


def _timeout_for_attempt(attempt: int) -> httpx.Timeout:
    read_timeout = (
        OPENAI_REALTIME_INITIAL_READ_TIMEOUT_SECONDS
        if attempt == 1
        else OPENAI_REALTIME_RETRY_READ_TIMEOUT_SECONDS
    )
    return httpx.Timeout(
        connect=OPENAI_REALTIME_CONNECT_TIMEOUT_SECONDS,
        read=read_timeout,
        write=OPENAI_REALTIME_WRITE_TIMEOUT_SECONDS,
        pool=OPENAI_REALTIME_POOL_TIMEOUT_SECONDS,
    )


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
        "input_audio_noise_reduction": {
            "type": "near_field",
        },
        "turn_detection": {
            "type": "server_vad",
            "threshold": 0.72,
            "prefix_padding_ms": 250,
            "silence_duration_ms": 700,
            "create_response": True,
            "interrupt_response": True,
        },
        "input_audio_transcription": {
            "model": "whisper-1",
            "language": "en",
            "prompt": "Transcribe spoken audio in English only. If the audio is unclear, return an empty transcript.",
        },
        "temperature": 0.7,
    }

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    started = time.perf_counter()
    last_error: RequestError | None = None
    response: httpx.Response | None = None
    attempts = 0

    for attempt in range(1, OPENAI_REALTIME_MAX_ATTEMPTS + 1):
        attempts = attempt
        timeout = _timeout_for_attempt(attempt)
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                response = await client.post(
                    OPENAI_REALTIME_SESSIONS_URL,
                    headers=headers,
                    json=payload,
                )
                if response.is_error and _should_retry_response(response) and attempt < OPENAI_REALTIME_MAX_ATTEMPTS:
                    await asyncio.sleep(_retry_delay_seconds(attempt, response))
                    continue
                break
            except RequestError as exc:
                last_error = exc
                if attempt < OPENAI_REALTIME_MAX_ATTEMPTS:
                    await asyncio.sleep(_retry_delay_seconds(attempt))
                    continue

    duration_ms = round((time.perf_counter() - started) * 1000, 2)

    if response is not None:
        log_eval_event(
            "openai_session_metrics",
            {
                "eval_run_id": eval_run_id,
                "url": OPENAI_REALTIME_SESSIONS_URL,
                "model": OPENAI_REALTIME_MODEL,
                "ok": not response.is_error,
                "duration_ms": duration_ms,
                "status_code": response.status_code,
                "attempts": attempts,
            },
        )
    else:
        log_eval_event(
            "openai_session_metrics",
            {
                "eval_run_id": eval_run_id,
                "url": OPENAI_REALTIME_SESSIONS_URL,
                "model": OPENAI_REALTIME_MODEL,
                "ok": False,
                "duration_ms": duration_ms,
                "status_code": None,
                "attempts": attempts,
                "error": type(last_error).__name__ if last_error else "RequestError",
            },
        )

    if response is None:
        detail = str(last_error) if last_error else "unknown transport error"
        raise OpenAISessionError(
            f"Couldn't connect to the realtime tutor after {attempts} attempts. Please try again. "
            f"Last transport error: {detail}"
        )

    if response.is_error:
        raise OpenAISessionError(
            f"Couldn't connect to the realtime tutor after {attempts} attempts. Please try again. "
            f"Upstream returned {response.status_code}: {response.text}"
        )

    data = response.json()
    data["session_config"] = payload
    return data
