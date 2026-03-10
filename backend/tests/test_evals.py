from fastapi.testclient import TestClient

from app.main import app
import app.routes.evals as evals_route

client = TestClient(app)


def test_ingest_client_events_logs_each_event(monkeypatch) -> None:
    logged: list[tuple[str, dict]] = []

    monkeypatch.setattr(evals_route, 'log_eval_event', lambda kind, payload: logged.append((kind, payload)))

    response = client.post(
        '/api/evals/client-events',
        json={
            'source': 'frontend-test',
            'events': [
                {'eval_run_id': 'r1', 'name': 'started', 'at_ms': 1.5, 'meta': {'step': 1}},
                {'name': 'done', 'meta': {}},
            ],
        },
    )

    assert response.status_code == 200
    assert response.json() == {'status': 'ok', 'count': 2}
    assert logged == [
        (
            'client_eval_events',
            {
                'source': 'frontend-test',
                'eval_run_id': 'r1',
                'name': 'started',
                'at_ms': 1.5,
                'meta': {'step': 1},
            },
        ),
        (
            'client_eval_events',
            {
                'source': 'frontend-test',
                'eval_run_id': None,
                'name': 'done',
                'at_ms': None,
                'meta': {},
            },
        ),
    ]
