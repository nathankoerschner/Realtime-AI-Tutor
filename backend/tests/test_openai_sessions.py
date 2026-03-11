from __future__ import annotations

from typing import Any

import httpx
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
    def __init__(self, outcomes: list[DummyResponse | Exception], sink: dict[str, Any]):
        self._outcomes = outcomes
        self._sink = sink
        self._sink['calls'] = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url: str, *, headers: dict[str, str], json: dict[str, Any]):
        self._sink['calls'] += 1
        self._sink['url'] = url
        self._sink['headers'] = headers
        self._sink['json'] = json
        outcome = self._outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


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
    monkeypatch.setattr(openai_sessions.httpx, 'AsyncClient', lambda timeout: DummyClient([response], captured))
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
    assert logs[0][1]['attempts'] == 1


@pytest.mark.anyio
async def test_create_realtime_session_retries_timeout_then_succeeds(monkeypatch) -> None:
    captured: dict[str, Any] = {}
    logs: list[tuple[str, dict[str, Any]]] = []
    response = DummyResponse(
        is_error=False,
        status_code=200,
        text='ok',
        payload={'client_secret': {'value': 'secret'}},
    )
    sleeps: list[float] = []

    monkeypatch.setattr(openai_sessions, 'OPENAI_API_KEY', 'test-key')
    monkeypatch.setattr(
        openai_sessions.httpx,
        'AsyncClient',
        lambda timeout: DummyClient([httpx.ReadTimeout('timed out'), response], captured),
    )
    monkeypatch.setattr(openai_sessions, 'log_eval_event', lambda kind, payload: logs.append((kind, payload)))

    async def fake_sleep(delay: float) -> None:
        sleeps.append(delay)

    monkeypatch.setattr(openai_sessions.asyncio, 'sleep', fake_sleep)

    data = await openai_sessions.create_realtime_session()

    assert data['client_secret']['value'] == 'secret'
    assert captured['calls'] == 2
    assert sleeps == [0.5]
    assert logs[0][1]['ok'] is True
    assert logs[0][1]['attempts'] == 2


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
    sleeps: list[float] = []

    monkeypatch.setattr(openai_sessions, 'OPENAI_API_KEY', 'test-key')
    monkeypatch.setattr(openai_sessions.httpx, 'AsyncClient', lambda timeout: DummyClient([response, response, response], captured))
    monkeypatch.setattr(openai_sessions, 'log_eval_event', lambda kind, payload: logs.append((kind, payload)))

    async def fake_sleep(delay: float) -> None:
        sleeps.append(delay)

    monkeypatch.setattr(openai_sessions.asyncio, 'sleep', fake_sleep)

    with pytest.raises(OpenAISessionError, match='OpenAI session creation failed after 3 attempts: 500 bad upstream'):
        await openai_sessions.create_realtime_session()

    assert captured['json']['instructions'] == openai_sessions.TUTOR_INSTRUCTIONS
    assert captured['calls'] == 3
    assert sleeps == [0.5, 1.0]
    assert logs[0][1]['ok'] is False
    assert logs[0][1]['status_code'] == 500
    assert logs[0][1]['attempts'] == 3


@pytest.mark.anyio
async def test_create_realtime_session_raises_and_logs_on_transport_error(monkeypatch) -> None:
    captured: dict[str, Any] = {}
    logs: list[tuple[str, dict[str, Any]]] = []
    sleeps: list[float] = []

    monkeypatch.setattr(openai_sessions, 'OPENAI_API_KEY', 'test-key')
    monkeypatch.setattr(
        openai_sessions.httpx,
        'AsyncClient',
        lambda timeout: DummyClient(
            [
                httpx.ReadTimeout('timed out'),
                httpx.ReadTimeout('timed out again'),
                httpx.ReadTimeout('timed out finally'),
            ],
            captured,
        ),
    )
    monkeypatch.setattr(openai_sessions, 'log_eval_event', lambda kind, payload: logs.append((kind, payload)))

    async def fake_sleep(delay: float) -> None:
        sleeps.append(delay)

    monkeypatch.setattr(openai_sessions.asyncio, 'sleep', fake_sleep)

    with pytest.raises(OpenAISessionError, match='OpenAI session creation failed after 3 attempts due to transport error: timed out finally'):
        await openai_sessions.create_realtime_session()

    assert captured['calls'] == 3
    assert sleeps == [0.5, 1.0]
    assert logs[0][1]['ok'] is False
    assert logs[0][1]['status_code'] is None
    assert logs[0][1]['attempts'] == 3
    assert logs[0][1]['error'] == 'ReadTimeout'
