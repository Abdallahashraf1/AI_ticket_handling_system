from typing import Any, Dict, List, Optional

from app.db.supabase_client import get_admin_client
from app.db.repositories.notification_repo import NotificationRepository

notification_repo = NotificationRepository()


def list_notifications(user_id: str, limit: int = 20, offset: int = 0) -> Dict[str, Any]:
    items = notification_repo.list_for_user(user_id=user_id, limit=limit, offset=offset)
    unread_count = notification_repo.count_unread(user_id=user_id)
    return {"items": items, "unread_count": unread_count}


def mark_notification_read(notification_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    return notification_repo.mark_read(notification_id=notification_id, user_id=user_id)


def create_notification(
    *,
    user_id: str,
    notification_type: str,
    title: str,
    body: Optional[str] = None,
    ticket_id: Optional[str] = None,
    action_url: Optional[str] = None,
) -> Dict[str, Any]:
    rows = notification_repo.create_many(
        [
            {
                "user_id": user_id,
                "type": notification_type,
                "title": title,
                "body": body,
                "ticket_id": ticket_id,
                "action_url": action_url,
                "is_read": False,
            }
        ]
    )
    return rows[0] if rows else {}


def notify_team(
    *,
    team_id: Optional[str],
    notification_type: str,
    title: str,
    body: Optional[str] = None,
    ticket_id: Optional[str] = None,
    action_url: Optional[str] = None,
) -> List[Dict[str, Any]]:
    if not team_id:
        return []

    sb = get_admin_client()
    response = (
        sb.table("profiles")
        .select("id")
        .eq("team_id", team_id)
        .in_("role", ["agent", "manager", "admin"])
        .execute()
    )
    users = response.data or []
    rows = [
        {
            "user_id": user["id"],
            "type": notification_type,
            "title": title,
            "body": body,
            "ticket_id": ticket_id,
            "action_url": action_url,
            "is_read": False,
        }
        for user in users
    ]
    return notification_repo.create_many(rows)


def notify_user_roles(
    *,
    roles: List[str],
    notification_type: str,
    title: str,
    body: Optional[str] = None,
    ticket_id: Optional[str] = None,
    action_url: Optional[str] = None,
) -> List[Dict[str, Any]]:
    sb = get_admin_client()
    response = sb.table("profiles").select("id").in_("role", roles).execute()
    users = response.data or []
    rows = [
        {
            "user_id": user["id"],
            "type": notification_type,
            "title": title,
            "body": body,
            "ticket_id": ticket_id,
            "action_url": action_url,
            "is_read": False,
        }
        for user in users
    ]
    return notification_repo.create_many(rows)

