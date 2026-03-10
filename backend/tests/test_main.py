from __future__ import annotations

import importlib
from pathlib import Path

from fastapi.testclient import TestClient

import app.config as config
import app.main as main_module


client = TestClient(main_module.app)


def test_health_returns_status_and_metadata() -> None:
    response = client.get('/api/health')

    assert response.status_code == 200
    assert response.json()['status'] == 'ok'
    assert 'env' in response.json()
    assert 'model' in response.json()


def test_serves_spa_index_and_assets() -> None:
    response = client.get('/missing-route')
    assert response.status_code == 200
    assert 'text/html' in response.headers['content-type']

    asset_path = next((config.FRONTEND_DIST / 'assets').glob('*.css'))
    asset_response = client.get(f'/assets/{asset_path.name}')
    assert asset_response.status_code == 200
    assert 'text/css' in asset_response.headers['content-type']

    # Test direct file serving
    index_response = client.get('/index.html')
    assert index_response.status_code == 200
    assert 'text/html' in index_response.headers['content-type']


def test_root_message_when_frontend_build_missing(monkeypatch, tmp_path) -> None:
    original_dist = config.FRONTEND_DIST
    monkeypatch.setattr(config, 'FRONTEND_DIST', tmp_path / 'missing-dist')
    reloaded = importlib.reload(main_module)

    try:
        response = TestClient(reloaded.app).get('/')
        assert response.status_code == 200
        assert response.json()['message'].startswith('Frontend build not found')
        assert response.json()['frontend_dist'] == str(tmp_path / 'missing-dist')
    finally:
        monkeypatch.setattr(config, 'FRONTEND_DIST', original_dist)
        importlib.reload(main_module)
