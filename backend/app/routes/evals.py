from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.eval_logging import log_eval_event

router = APIRouter(prefix="/api/evals", tags=["evals"])


class ClientEvalEvent(BaseModel):
    eval_run_id: str | None = None
    name: str
    at_ms: float | None = None
    meta: dict[str, object] = Field(default_factory=dict)


class ClientEvalBatch(BaseModel):
    source: str = "frontend"
    events: list[ClientEvalEvent] = Field(default_factory=list)


@router.post("/client-events")
async def ingest_client_events(payload: ClientEvalBatch) -> dict[str, int | str]:
    for event in payload.events:
        log_eval_event(
            "client_eval_events",
            {
                "source": payload.source,
                "eval_run_id": event.eval_run_id,
                "name": event.name,
                "at_ms": event.at_ms,
                "meta": event.meta,
            },
        )
    return {"status": "ok", "count": len(payload.events)}