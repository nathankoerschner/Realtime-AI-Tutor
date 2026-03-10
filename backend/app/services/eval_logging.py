from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import EVAL_LOG_DIR

_LOCK = threading.Lock()


def _log_path(kind: str) -> Path:
    EVAL_LOG_DIR.mkdir(parents=True, exist_ok=True)
    return EVAL_LOG_DIR / f"{kind}.jsonl"


def log_eval_event(kind: str, payload: dict[str, Any]) -> None:
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **payload,
    }
    encoded = json.dumps(record, ensure_ascii=False)
    path = _log_path(kind)
    with _LOCK:
        with path.open("a", encoding="utf-8") as f:
            f.write(encoded + "\n")