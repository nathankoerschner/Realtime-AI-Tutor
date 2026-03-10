import json

import app.services.eval_logging as eval_logging


def test_log_eval_event_writes_jsonl_records(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(eval_logging, 'EVAL_LOG_DIR', tmp_path)

    path = eval_logging._log_path('sample')
    assert path == tmp_path / 'sample.jsonl'

    eval_logging.log_eval_event('sample', {'ok': True})

    contents = path.read_text(encoding='utf-8').strip().splitlines()
    assert len(contents) == 1
    record = json.loads(contents[0])
    assert record['ok'] is True
    assert 'timestamp' in record
