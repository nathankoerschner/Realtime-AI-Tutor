from __future__ import annotations

from typing import Any

import pytest

import app.services.transcript_normalization as transcript_normalization
from app.services.transcript_normalization import TranscriptNormalizationError


class DummyResponse:
    def __init__(self, *, is_error: bool, status_code: int, text: str, payload: dict[str, Any] | None = None):
        self.is_error = is_error
        self.status_code = status_code
        self.text = text
        self._payload = payload or {}

    def json(self) -> dict[str, Any]:
        return self._payload


class DummyClient:
    def __init__(self, response: DummyResponse, sink: dict[str, Any]):
        self._response = response
        self._sink = sink

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url: str, *, headers: dict[str, str], json: dict[str, Any]):
        self._sink['url'] = url
        self._sink['headers'] = headers
        self._sink['json'] = json
        return self._response


@pytest.mark.anyio
async def test_normalize_transcript_to_english_builds_request_and_returns_text(monkeypatch) -> None:
    captured: dict[str, Any] = {}
    response = DummyResponse(
        is_error=False,
        status_code=200,
        text='ok',
        payload={'choices': [{'message': {'content': 'something nice'}}]},
    )

    monkeypatch.setattr(transcript_normalization, 'OPENAI_API_KEY', 'test-key')
    monkeypatch.setattr(transcript_normalization, 'OPENAI_TRANSCRIPT_NORMALIZER_MODEL', 'gpt-test')
    monkeypatch.setattr(
        transcript_normalization.httpx,
        'AsyncClient',
        lambda timeout: DummyClient(response, captured),
    )

    result = await transcript_normalization.normalize_transcript_to_english('  Sao hezkého.  ')

    assert result == 'something nice'
    assert captured['url'] == transcript_normalization.OPENAI_CHAT_COMPLETIONS_URL
    assert captured['headers']['Authorization'] == 'Bearer test-key'
    assert captured['json']['model'] == 'gpt-test'
    assert captured['json']['messages'][1]['content'] == 'Sao hezkého.'


@pytest.mark.anyio
async def test_normalize_transcript_to_english_returns_empty_for_blank_input(monkeypatch) -> None:
    monkeypatch.setattr(transcript_normalization, 'OPENAI_API_KEY', 'test-key')

    assert await transcript_normalization.normalize_transcript_to_english('   ') == ''


@pytest.mark.anyio
async def test_normalize_transcript_to_english_raises_for_missing_api_key(monkeypatch) -> None:
    monkeypatch.setattr(transcript_normalization, 'OPENAI_API_KEY', '')

    with pytest.raises(TranscriptNormalizationError, match='OPENAI_API_KEY is not configured'):
        await transcript_normalization.normalize_transcript_to_english('hello')


@pytest.mark.anyio
async def test_normalize_transcript_to_english_raises_for_upstream_error(monkeypatch) -> None:
    response = DummyResponse(is_error=True, status_code=500, text='bad upstream')

    monkeypatch.setattr(transcript_normalization, 'OPENAI_API_KEY', 'test-key')
    monkeypatch.setattr(
        transcript_normalization.httpx,
        'AsyncClient',
        lambda timeout: DummyClient(response, {}),
    )

    with pytest.raises(
        TranscriptNormalizationError,
        match='Transcript normalization failed with 500: bad upstream',
    ):
        await transcript_normalization.normalize_transcript_to_english('hello')
