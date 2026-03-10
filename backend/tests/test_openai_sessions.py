from __future__ import annotations

from typing import Any

import pytest

import app.services.openai_sessions as openai_sessions
from app.services.openai_sessions import OpenAISessionError


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
async def test_create_realtime_session_builds_payload_and_logs_metrics(monkeypatch) -> None:
    captured: dict[str, Any] = {}
    logs: list[tuple[str, dict[str, Any]]] = []
    response = DummyResponse(
        is_error=False,
        status_code=200,
        text='ok',
        payload={'client_secret': {'value': 'secret'}},
    )

    monkeypatch.setattr(openai_sessions, 'OPENAI_API_KEY', 'test-key')
    monkeypatch.setattr(openai_sessions, 'OPENAI_REALTIME_MODEL', 'test-model')
    monkeypatch.setattr(openai_sessions, 'httpx', type('Httpx', (), {
        'AsyncClient': lambda timeout: DummyClient(response, captured),
    }))
    monkeypatch.setattr(openai_sessions, 'log_eval_event', lambda kind, payload: logs.append((kind, payload)))

    data = await openai_sessions.create_realtime_session('fractions', 'grade 6', 'eval-1')

    assert captured['url'] == openai_sessions.OPENAI_REALTIME_SESSIONS_URL
    assert captured['headers']['Authorization'] == 'Bearer test-key'
    assert captured['json']['model'] == 'test-model'
    assert captured['json']['voice'] == 'alloy'
    assert 'Student level hint: grade 6.' in captured['json']['instructions']
    assert 'Opening topic hint from UI: fractions.' in captured['json']['instructions']
    assert data['client_secret']['value'] == 'secret'
    assert data['session_config'] == captured['json']
    assert logs[0][0] == 'openai_session_metrics'
    assert logs[0][1]['ok'] is True
    assert logs[0][1]['eval_run_id'] == 'eval-1'


@pytest.mark.anyio
async def test_create_realtime_session_raises_for_missing_api_key() -> None:
    with pytest.MonkeyPatch.context() as monkeypatch:
        monkeypatch.setattr(openai_sessions, 'OPENAI_API_KEY', '')
        with pytest.raises(OpenAISessionError, match='OPENAI_API_KEY is not configured'):
            await openai_sessions.create_realtime_session()


@pytest.mark.anyio
async def test_create_realtime_session_raises_and_logs_on_http_error(monkeypatch) -> None:
    captured: dict[str, Any] = {}
    logs: list[tuple[str, dict[str, Any]]] = []
    response = DummyResponse(is_error=True, status_code=500, text='bad upstream')

    monkeypatch.setattr(openai_sessions, 'OPENAI_API_KEY', 'test-key')
    monkeypatch.setattr(openai_sessions, 'httpx', type('Httpx', (), {
        'AsyncClient': lambda timeout: DummyClient(response, captured),
    }))
    monkeypatch.setattr(openai_sessions, 'log_eval_event', lambda kind, payload: logs.append((kind, payload)))

    with pytest.raises(OpenAISessionError, match='OpenAI session creation failed: 500 bad upstream'):
        await openai_sessions.create_realtime_session()

    assert captured['json']['instructions'] == openai_sessions.TUTOR_INSTRUCTIONS
    assert logs[0][1]['ok'] is False
    assert logs[0][1]['status_code'] == 500
