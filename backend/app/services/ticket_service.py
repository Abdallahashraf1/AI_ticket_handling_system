from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict

import structlog

from app.db.redis import get_redis
from app.db.supabase_client import get_admin_client
from app.services.notification_service import notify_user_roles

logger = structlog.get_logger()

DEAD_LETTER_KEY = "tickets:dead_letter"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def record_ticket_event(ticket_id: str, event_type: str, data: Dict[str, Any] | None = None) -> None:
    get_admin_client().table("ticket_events").insert(
        {
            "ticket_id": ticket_id,
            "event_type": event_type,
            "actor_type": "system",
            "actor_id": "ticket-service",
            "data": data or {},
        }
    ).execute()


def mark_ticket_retry(ticket_id: str, attempt: int, reason: str) -> None:
    payload = {
        "processing_error": reason,
        "last_processing_error_at": _now_iso(),
        "processing_attempts": attempt,
    }
    try:
        get_admin_client().table("tickets").update(payload).eq("id", ticket_id).execute()
    except Exception as exc:
        logger.warning("ticket_retry_update_failed", ticket_id=ticket_id, error=str(exc))
    try:
        record_ticket_event(ticket_id, "processing_retry_scheduled", {"attempt": attempt, "reason": reason})
    except Exception as exc:
        logger.warning("ticket_retry_event_failed", ticket_id=ticket_id, error=str(exc))


async def move_ticket_to_dead_letter(ticket_id: str, reason: str, attempts: int) -> None:
    payload = {
        "ticket_id": ticket_id,
        "reason": reason,
        "attempts": attempts,
        "moved_at": _now_iso(),
    }
    try:
        get_admin_client().table("tickets").update(
            {
                "status": "pending_review",
                "processing_error": reason,
                "last_processing_error_at": _now_iso(),
                "processing_attempts": attempts,
            }
        ).eq("id", ticket_id).execute()
    except Exception as exc:
        logger.warning("ticket_dead_letter_update_failed", ticket_id=ticket_id, error=str(exc))

    try:
        record_ticket_event(ticket_id, "processing_dead_lettered", {"attempts": attempts, "reason": reason})
    except Exception as exc:
        logger.warning("ticket_dead_letter_event_failed", ticket_id=ticket_id, error=str(exc))

    try:
        redis_client = await get_redis()
        await redis_client.lpush(DEAD_LETTER_KEY, json.dumps(payload))
    except Exception as exc:
        logger.warning("ticket_dead_letter_queue_failed", ticket_id=ticket_id, error=str(exc))

    try:
        notify_user_roles(
            roles=["manager", "admin"],
            notification_type="system",
            title="Ticket moved to dead letter queue",
            body=f"Ticket {ticket_id} failed processing after {attempts} attempts.",
            ticket_id=ticket_id,
            action_url=f"/agent/tickets/{ticket_id}",
        )
    except Exception as exc:
        logger.warning("ticket_dead_letter_notification_failed", ticket_id=ticket_id, error=str(exc))
