import structlog
from typing import Optional

from app.db.supabase_client import get_admin_client
from app.services.notification_service import notify_team, notify_user_roles

logger = structlog.get_logger()

async def send_notification(ticket_id: str, message: str, assigned_team: str, db_client=None):
    """
    Dispatch notification for an escalated ticket.
    """
    logger.info("Notification Send", ticket_id=ticket_id, message=message, team=assigned_team)

    sb = db_client or get_admin_client()
    team_id: Optional[str] = None

    try:
        team_resp = sb.table("teams").select("id").eq("name", assigned_team).limit(1).execute()
        if team_resp.data:
            team_id = team_resp.data[0]["id"]
    except Exception as e:
        logger.warning("Failed to resolve team by name", error=str(e), assigned_team=assigned_team)

    if team_id:
        notify_team(
            team_id=team_id,
            notification_type="ticket_escalated",
            title="New escalated ticket",
            body=message,
            ticket_id=ticket_id,
            action_url=f"/agent/tickets/{ticket_id}",
        )
        return

    # Fallback: notify managers/admins if team mapping is unavailable.
    notify_user_roles(
        roles=["manager", "admin"],
        notification_type="ticket_escalated",
        title="New escalated ticket",
        body=message,
        ticket_id=ticket_id,
        action_url=f"/agent/tickets/{ticket_id}",
    )
