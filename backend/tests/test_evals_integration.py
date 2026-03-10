"""Integration tests for the evaluation framework."""

import json
import pytest
from pathlib import Path
from unittest.mock import patch, AsyncMock

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_eval_client_events_endpoint():
    """Test the client events ingestion endpoint."""
    payload = {
        "source": "test",
        "events": [
            {
                "eval_run_id": "test_run_123",
                "name": "test_event",
                "at_ms": 123.45,
                "meta": {"test": True}
            },
            {
                "name": "another_event", 
                "at_ms": 456.78
            }
        ]
    }
    
    response = client.post("/api/evals/client-events", json=payload)
    
    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "ok"
    assert result["count"] == 2


def test_eval_logging_creates_files(tmp_path, monkeypatch):
    """Test that eval events are logged to files."""
    from app.services import eval_logging
    
    monkeypatch.setattr(eval_logging, 'EVAL_LOG_DIR', tmp_path)
    
    # Submit events through API
    payload = {
        "source": "test_integration",
        "events": [
            {
                "eval_run_id": "integration_test",
                "name": "session_start",
                "at_ms": 0,
                "meta": {"scenario": "test_scenario"}
            }
        ]
    }
    
    response = client.post("/api/evals/client-events", json=payload)
    assert response.status_code == 200
    
    # Check that log file was created
    log_file = tmp_path / "client_eval_events.jsonl"
    assert log_file.exists()
    
    # Verify content
    content = log_file.read_text()
    lines = content.strip().split('\n')
    assert len(lines) == 1
    
    record = json.loads(lines[0])
    assert record["source"] == "test_integration"
    assert record["eval_run_id"] == "integration_test"
    assert record["name"] == "session_start"
    assert "timestamp" in record


def test_eval_events_with_missing_fields():
    """Test eval events with optional fields missing."""
    payload = {
        "events": [
            {
                "name": "minimal_event",
                "at_ms": None  # Optional field
            }
        ]
    }
    
    response = client.post("/api/evals/client-events", json=payload)
    assert response.status_code == 200
    
    result = response.json()
    assert result["count"] == 1


def test_eval_events_empty_batch():
    """Test empty event batch."""
    payload = {"events": []}
    
    response = client.post("/api/evals/client-events", json=payload)
    assert response.status_code == 200
    
    result = response.json()
    assert result["count"] == 0


def test_eval_events_invalid_payload():
    """Test invalid payload handling — missing required 'name' in event triggers 422."""
    response = client.post(
        "/api/evals/client-events",
        json={"events": [{"at_ms": 100}]},  # missing required 'name' field
    )
    assert response.status_code == 422  # Validation error
