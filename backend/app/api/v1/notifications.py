from fastapi import APIRouter, Depends, HTTPException, Query

from app.middleware.auth import get_current_user
from app.services.notification_service import list_notifications, mark_notification_read

router = APIRouter()


@router.get("")
async def get_notifications(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    return list_notifications(user_id=user["id"], limit=limit, offset=offset)


@router.patch("/{notification_id}/read")
async def mark_read(notification_id: str, user: dict = Depends(get_current_user)):
    updated = mark_notification_read(notification_id=notification_id, user_id=user["id"])
    if not updated:
        raise HTTPException(status_code=404, detail="Notification not found")
    return updated

