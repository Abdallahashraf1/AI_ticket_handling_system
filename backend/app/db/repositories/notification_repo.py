from typing import Any, Dict, List, Optional

from app.db.supabase_client import get_admin_client


class NotificationRepository:
    def list_for_user(self, user_id: str, limit: int = 20, offset: int = 0) -> List[Dict[str, Any]]:
        sb = get_admin_client()
        response = (
            sb.table("notifications")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return response.data or []

    def count_unread(self, user_id: str) -> int:
        sb = get_admin_client()
        response = (
            sb.table("notifications")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .eq("is_read", False)
            .execute()
        )
        return response.count or 0

    def create_many(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not rows:
            return []
        sb = get_admin_client()
        response = sb.table("notifications").insert(rows).execute()
        return response.data or []

    def mark_read(self, notification_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        sb = get_admin_client()
        response = (
            sb.table("notifications")
            .update({"is_read": True})
            .eq("id", notification_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not response.data:
            return None
        return response.data[0]

