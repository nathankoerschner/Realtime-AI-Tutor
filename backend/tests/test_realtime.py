from fastapi.testclient import TestClient

from app.main import app
import app.routes.realtime as realtime
from app.services.openai_sessions import OpenAISessionError

client = TestClient(app)


def test_create_session_returns_service_payload_and_logs_success(monkeypatch) -> None:
    logged: list[tuple[str, dict]] = []

    async def fake_create_realtime_session(topic_hint, student_level, eval_run_id):
        assert topic_hint == 'fractions'
        assert student_level == 'grade 7'
        assert eval_run_id == 'eval-1'
        return {'client_secret': {'value': 'secret'}, 'session_config': {'model': 'test-model'}}

    monkeypatch.setattr(realtime, 'create_realtime_session', fake_create_realtime_session)
    monkeypatch.setattr(realtime, 'log_eval_event', lambda kind, payload: logged.append((kind, payload)))

    response = client.post(
        '/api/realtime/session',
        json={'topic_hint': 'fractions', 'student_level': 'grade 7', 'eval_run_id': 'eval-1'},
    )

    assert response.status_code == 200
    assert response.json()['client_secret']['value'] == 'secret'
    assert response.json()['session_config']['model'] == 'test-model'
    assert logged[0][0] == 'backend_session_metrics'
    assert logged[0][1]['ok'] is True
    assert logged[0][1]['eval_run_id'] == 'eval-1'


def test_create_session_converts_openai_session_errors_to_http_500(monkeypatch) -> None:
    logged: list[tuple[str, dict]] = []

    async def fake_create_realtime_session(_topic_hint, _student_level, _eval_run_id):
        raise OpenAISessionError('boom')

    monkeypatch.setattr(realtime, 'create_realtime_session', fake_create_realtime_session)
    monkeypatch.setattr(realtime, 'log_eval_event', lambda kind, payload: logged.append((kind, payload)))

    response = client.post('/api/realtime/session', json={})

    assert response.status_code == 500
    assert response.json() == {'detail': 'boom'}
    assert logged[0][0] == 'backend_session_metrics'
    assert logged[0][1]['ok'] is False
    assert logged[0][1]['error'] == 'boom'
