from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
from typing import Any, Dict, List, Optional

import structlog

from app.config import settings
from app.db.redis import get_redis_sync
from app.db.supabase_client import get_admin_client
from app.services.notification_service import create_notification, notify_team, notify_user_roles

logger = structlog.get_logger()

OPEN_TICKET_STATUSES = ["new", "triaged", "triaging", "routing", "resolving", "escalated", "pending_review", "reopened"]
BUSINESS_START_HOUR = 9
BUSINESS_END_HOUR = 17
BUSINESS_DAYS = {0, 1, 2, 3, 4}  # Monday-Friday


@dataclass
class SLAPolicy:
    id: str
    name: str
    priority: str
    first_response_hours: int
    resolution_hours: int
    business_hours_only: bool
    is_default: bool


class SLAService:
    def __init__(self) -> None:
        self.sb = get_admin_client()
        self._policy_cache_key = "sla:policies"

    def list_policies(self) -> List[Dict[str, Any]]:
        return self._get_cached_policies()

    def create_policy(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        response = self.sb.table("sla_policies").insert(payload).execute()
        if not response.data:
            raise ValueError("Failed to create SLA policy")
        self._invalidate_policy_cache()
        return response.data[0]

    def update_policy(self, policy_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        response = self.sb.table("sla_policies").update(payload).eq("id", policy_id).execute()
        if not response.data:
            raise ValueError("SLA policy not found")
        self._invalidate_policy_cache()
        return response.data[0]

    def delete_policy(self, policy_id: str) -> None:
        self.sb.table("sla_policies").delete().eq("id", policy_id).execute()
        self._invalidate_policy_cache()

    def _get_cached_policies(self) -> List[Dict[str, Any]]:
        try:
            redis_client = get_redis_sync()
            cached = redis_client.get(self._policy_cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

        response = self.sb.table("sla_policies").select("*").order("priority").execute()
        policies = response.data or []
        try:
            redis_client = get_redis_sync()
            redis_client.set(self._policy_cache_key, json.dumps(policies), ex=settings.ANALYTICS_CACHE_TTL_SECONDS)
        except Exception:
            pass
        return policies

    def _invalidate_policy_cache(self) -> None:
        try:
            get_redis_sync().delete(self._policy_cache_key)
        except Exception:
            pass

    def _is_business_time(self, dt: datetime) -> bool:
        return dt.weekday() in BUSINESS_DAYS and BUSINESS_START_HOUR <= dt.hour < BUSINESS_END_HOUR

    def _move_to_next_business_start(self, dt: datetime) -> datetime:
        cursor = dt
        while True:
            if cursor.weekday() in BUSINESS_DAYS and cursor.hour < BUSINESS_START_HOUR:
                return cursor.replace(hour=BUSINESS_START_HOUR, minute=0, second=0, microsecond=0)
            if cursor.weekday() in BUSINESS_DAYS and BUSINESS_START_HOUR <= cursor.hour < BUSINESS_END_HOUR:
                return cursor
            cursor = (cursor + timedelta(days=1)).replace(hour=BUSINESS_START_HOUR, minute=0, second=0, microsecond=0)

    def _add_business_hours(self, start: datetime, hours: int) -> datetime:
        remaining = timedelta(hours=hours)
        cursor = self._move_to_next_business_start(start)
        while remaining > timedelta(0):
            end_of_day = cursor.replace(hour=BUSINESS_END_HOUR, minute=0, second=0, microsecond=0)
            available = end_of_day - cursor
            if remaining <= available:
                return cursor + remaining
            remaining -= available
            cursor = self._move_to_next_business_start(end_of_day + timedelta(seconds=1))
        return cursor

    def _find_policy(self, priority: str) -> Optional[Dict[str, Any]]:
        policies = self._get_cached_policies()
        ordered = sorted(
            [policy for policy in policies if policy.get("priority") == priority],
            key=lambda policy: bool(policy.get("is_default")),
            reverse=True,
        )
        return ordered[0] if ordered else None

    def calculate_deadline(self, priority: str, created_at: datetime) -> datetime:
        policy = self._find_policy(priority) or self._find_policy("medium")
        resolution_hours = int((policy or {}).get("resolution_hours", 48))
        business_hours_only = bool((policy or {}).get("business_hours_only", True))

        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        created_at = created_at.astimezone(timezone.utc)

        if business_hours_only:
            return self._add_business_hours(created_at, resolution_hours)
        return created_at + timedelta(hours=resolution_hours)

    def _log_event(self, ticket_id: str, event_type: str, data: Optional[Dict[str, Any]] = None) -> None:
        self.sb.table("ticket_events").insert(
            {
                "ticket_id": ticket_id,
                "event_type": event_type,
                "actor_type": "system",
                "actor_id": "sla-engine",
                "data": data or {},
            }
        ).execute()

    def _has_event(self, ticket_id: str, event_type: str) -> bool:
        result = (
            self.sb.table("ticket_events")
            .select("id", count="exact")
            .eq("ticket_id", ticket_id)
            .eq("event_type", event_type)
            .execute()
        )
        return bool(result.count)

    def _send_warning(self, ticket: Dict[str, Any], ratio: float) -> None:
        if self._has_event(ticket["id"], "sla_warning"):
            return
        self._log_event(ticket["id"], "sla_warning", {"elapsed_ratio": round(ratio, 3)})
        notify_team(
            team_id=ticket.get("assigned_team_id"),
            notification_type="sla_warning",
            title="SLA warning",
            body=f"Ticket approaching SLA breach: {ticket.get('subject', ticket['id'])}",
            ticket_id=ticket["id"],
            action_url=f"/agent/tickets/{ticket['id']}",
        )
        if ticket.get("assigned_agent_id"):
            create_notification(
                user_id=ticket["assigned_agent_id"],
                notification_type="sla_warning",
                title="SLA warning",
                body=f"Ticket at {int(ratio * 100)}% of SLA time",
                ticket_id=ticket["id"],
                action_url=f"/agent/tickets/{ticket['id']}",
            )

    def _send_breach(self, ticket: Dict[str, Any]) -> None:
        self._log_event(ticket["id"], "sla_breached", {"sla_deadline": ticket.get("sla_deadline")})
        notify_user_roles(
            roles=["manager", "admin"],
            notification_type="sla_breach",
            title="SLA breached",
            body=f"Ticket breached SLA: {ticket.get('subject', ticket['id'])}",
            ticket_id=ticket["id"],
            action_url=f"/agent/tickets/{ticket['id']}",
        )

    def check_breaches(self, now: Optional[datetime] = None) -> Dict[str, int]:
        now_utc = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
        response = (
            self.sb.table("tickets")
            .select("id,subject,status,created_at,sla_deadline,sla_breached,assigned_agent_id,assigned_team_id")
            .in_("status", OPEN_TICKET_STATUSES)
            .not_.is_("sla_deadline", "null")
            .execute()
        )
        tickets = response.data or []
        warning_count = 0
        breach_count = 0

        for ticket in tickets:
            try:
                created_at = datetime.fromisoformat(ticket["created_at"].replace("Z", "+00:00"))
                deadline = datetime.fromisoformat(ticket["sla_deadline"].replace("Z", "+00:00"))
            except Exception:
                continue
            total_seconds = max((deadline - created_at).total_seconds(), 1.0)
            elapsed_seconds = (now_utc - created_at).total_seconds()
            elapsed_ratio = max(0.0, elapsed_seconds / total_seconds)

            if now_utc >= deadline and not ticket.get("sla_breached"):
                self.sb.table("tickets").update({"sla_breached": True}).eq("id", ticket["id"]).execute()
                self._send_breach(ticket)
                breach_count += 1
            elif elapsed_ratio >= 0.75:
                self._send_warning(ticket, elapsed_ratio)
                warning_count += 1

        logger.info("sla_check_complete", warnings=warning_count, breaches=breach_count, scanned=len(tickets))
        return {"warnings": warning_count, "breaches": breach_count, "scanned": len(tickets)}

    def get_sla_dashboard(self) -> Dict[str, Any]:
        total_with_sla = (
            self.sb.table("tickets")
            .select("id", count="exact")
            .not_.is_("sla_deadline", "null")
            .execute()
            .count
            or 0
        )
        breached = (
            self.sb.table("tickets")
            .select("id", count="exact")
            .eq("sla_breached", True)
            .execute()
            .count
            or 0
        )
        compliance_rate = round(((total_with_sla - breached) / total_with_sla) * 100, 2) if total_with_sla else 100.0

        by_priority_resp = (
            self.sb.table("tickets")
            .select("priority,sla_breached")
            .not_.is_("sla_deadline", "null")
            .execute()
        )
        by_priority: Dict[str, Dict[str, int]] = {}
        for row in by_priority_resp.data or []:
            priority = row.get("priority") or "unknown"
            if priority not in by_priority:
                by_priority[priority] = {"total": 0, "breached": 0}
            by_priority[priority]["total"] += 1
            if row.get("sla_breached"):
                by_priority[priority]["breached"] += 1

        priority_metrics = [
            {
                "priority": key,
                "total": value["total"],
                "breached": value["breached"],
                "compliance": round(((value["total"] - value["breached"]) / value["total"]) * 100, 2)
                if value["total"]
                else 100.0,
            }
            for key, value in by_priority.items()
        ]
        priority_metrics.sort(key=lambda row: row["priority"])

        return {
            "total_with_sla": total_with_sla,
            "breached_tickets": breached,
            "compliance_rate": compliance_rate,
            "priority_metrics": priority_metrics,
        }
