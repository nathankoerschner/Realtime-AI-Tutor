from __future__ import annotations

from typing import Any

import httpx

from app.config import OPENAI_API_KEY, OPENAI_TRANSCRIPT_NORMALIZER_MODEL

OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"
NORMALIZATION_TIMEOUT_SECONDS = 5.0
SYSTEM_PROMPT = (
    "You convert speech transcripts into English only. "
    "If the input is already English, return a cleaned English transcript with the same meaning. "
    "If the input is another language, translate it to natural English. "
    "If the input is gibberish, unclear, or not confidently understandable, return an empty string. "
    "Return only the final transcript text with no quotes or commentary."
)


class TranscriptNormalizationError(RuntimeError):
    pass


async def normalize_transcript_to_english(transcript: str) -> str:
    if not OPENAI_API_KEY:
        raise TranscriptNormalizationError("OPENAI_API_KEY is not configured")

    normalized_input = transcript.strip()
    if not normalized_input:
        return ""

    payload: dict[str, Any] = {
        "model": OPENAI_TRANSCRIPT_NORMALIZER_MODEL,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": normalized_input},
        ],
    }
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    timeout = httpx.Timeout(NORMALIZATION_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(OPENAI_CHAT_COMPLETIONS_URL, headers=headers, json=payload)

    if response.is_error:
        raise TranscriptNormalizationError(
            f"Transcript normalization failed with {response.status_code}: {response.text}"
        )

    data = response.json()
    choices = data.get("choices") or []
    content = ((choices[0] or {}).get("message") or {}).get("content", "") if choices else ""
    return content.strip()
