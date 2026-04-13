import structlog

logger = structlog.get_logger()

async def send_notification(ticket_id: str, message: str, assigned_team: str, db_client=None):
    """
    Dispatch notification of an escalated ticket assigning it to a team.
    In Phase 2, we just log it or insert a basic DB record.
    """
    logger.info("Notification Send", ticket_id=ticket_id, message=message, team=assigned_team)
    
    if db_client:
        try:
            # Simple notification stub assuming notifications table exists
            db_client.table('notifications').insert({
                "ticket_id": ticket_id,
                "message": message,
                "target_team": assigned_team,
                "read": False
            }).execute()
        except Exception as e:
            logger.error("Failed to insert notification", error=str(e))
