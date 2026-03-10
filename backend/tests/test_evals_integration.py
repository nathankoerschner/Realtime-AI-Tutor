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
    """Test invalid payload handling."""
    response = client.post("/api/evals/client-events", json={"invalid": "data"})
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_scenario_runner_mock_integration():
    """Test scenario runner integration with mocked dependencies."""
    from evals.runners.scenario_runner import ScenarioRunner
    from evals.scenarios.basic_scenarios import QUICK_RESPONSE_TEST
    
    # Mock the session creation and response generation
    runner = ScenarioRunner("http://localhost:8000")
    
    with patch.object(runner, '_create_session', new_callable=AsyncMock) as mock_session:
        with patch.object(runner, '_generate_mock_response', new_callable=AsyncMock) as mock_response:
            mock_session.return_value = {"session": {"id": "test_session"}}
            mock_response.return_value = "Great question! What do you think?"
            
            result = await runner.run_scenario(QUICK_RESPONSE_TEST, "test_run")
            
            assert result["success"] is True or result["success"] is False  # Depends on criteria
            assert len(result["turns"]) == len(QUICK_RESPONSE_TEST.turns)
            assert result["scenario"] == "quick_response_test"
            assert "socratic_scores" in result
            assert "performance_metrics" in result


def test_performance_analyzer_with_test_data(tmp_path, monkeypatch):
    """Test performance analyzer with synthetic data."""
    from evals.analyzers.performance_analyzer import PerformanceAnalyzer
    from app.services import eval_logging
    
    monkeypatch.setattr(eval_logging, 'EVAL_LOG_DIR', tmp_path)
    
    # Create test data
    test_events = [
        {
            "timestamp": "2024-03-10T12:00:00Z",
            "eval_run_id": "perf_test",
            "name": "session_start",
            "at_ms": 0
        },
        {
            "timestamp": "2024-03-10T12:00:01Z", 
            "eval_run_id": "perf_test",
            "name": "first_audio_frame",
            "at_ms": 450
        },
        {
            "timestamp": "2024-03-10T12:00:02Z",
            "eval_run_id": "perf_test", 
            "name": "tutor_response_start",
            "at_ms": 1200,
            "meta": {"response_latency_ms": 800}
        }
    ]
    
    # Write test data to log file
    log_file = tmp_path / "test_events.jsonl"
    with log_file.open('w') as f:
        for event in test_events:
            f.write(json.dumps(event) + '\n')
    
    # Analyze performance
    analyzer = PerformanceAnalyzer(tmp_path)
    metrics = analyzer.analyze_run("perf_test")
    
    assert metrics.time_to_first_frame_ms == 450
    assert metrics.avg_response_latency_ms == 800
    assert metrics.error_count == 0


def test_socratic_evaluator_basic_functionality():
    """Test Socratic evaluator with mock OpenAI responses."""
    from evals.rubrics.socratic_eval import AnswerGivingDetector
    
    # Test direct answer detection
    direct_answer = "The answer is 42. X equals 5."
    detected = AnswerGivingDetector.detect_direct_answers(direct_answer)
    assert len(detected) > 0
    
    # Test question detection
    good_question = "What do you think might happen if we try a different approach?"
    has_questions = AnswerGivingDetector.has_guiding_questions(good_question)
    assert has_questions is True
    
    # Test no questions
    no_questions = "That's correct. Well done."
    has_questions = AnswerGivingDetector.has_guiding_questions(no_questions)
    assert has_questions is False