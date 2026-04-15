from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
import structlog

from app.db.supabase_client import get_admin_client
from app.middleware.auth import get_current_user
from app.models.ticket import TicketCreate, TicketResponse
from app.services.notification_service import create_notification, notify_team

router = APIRouter()
logger = structlog.get_logger()


class RejectDraftPayload(BaseModel):
    feedback: str = Field(min_length=1)
    retry: bool = True


class EditResolvePayload(BaseModel):
    final_response: str = Field(min_length=1)
    resolution_notes: Optional[str] = None


class ReopenPayload(BaseModel):
    reason: Optional[str] = None


class FeedbackPayload(BaseModel):
    helpful: bool
    comment: Optional[str] = None


def _is_agent_role(role: str) -> bool:
    return role in ("agent", "manager", "admin")


def _fetch_ticket_or_404(ticket_id: str) -> Dict[str, Any]:
    sb = get_admin_client()
    response = sb.table("tickets").select("*").eq("id", ticket_id).single().execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return response.data


def _can_access_ticket(user: dict, ticket: Dict[str, Any]) -> bool:
    if user["role"] in ("manager", "admin"):
        return True
    if user["role"] == "customer":
        return ticket["submitter_id"] == user["id"]
    if user["role"] == "agent":
        if ticket.get("assigned_agent_id") == user["id"]:
            return True
        if user.get("team_id") and ticket.get("assigned_team_id") == user["team_id"]:
            return True
    return False


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _log_event(
    ticket_id: str,
    event_type: str,
    actor_type: str,
    actor_id: str,
    data: Optional[Dict[str, Any]] = None,
) -> None:
    sb = get_admin_client()
    payload = {
        "ticket_id": ticket_id,
        "event_type": event_type,
        "actor_type": actor_type,
        "actor_id": actor_id,
        "data": data or {},
    }
    try:
        sb.table("ticket_events").insert(payload).execute()
    except Exception as exc:
        # Keep ticket actions available even if audit schema differs across environments.
        logger.warning("ticket_event_insert_failed", error=str(exc), payload=payload)


@router.post("", response_model=TicketResponse)
async def create_ticket(ticket: TicketCreate, user: dict = Depends(get_current_user)):
    sb = get_admin_client()
    ticket_data = {
        "subject": ticket.subject,
        "body": ticket.body,
        "submitter_id": user["id"],
        "source": "web",
        "category": ticket.category,
        "priority": ticket.priority,
        "attachments": ticket.attachments or [],
        "status": "new",
    }
    response = sb.table("tickets").insert(ticket_data).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create ticket")

    new_ticket = response.data[0]
    _log_event(
        ticket_id=new_ticket["id"],
        event_type="created",
        actor_type="user",
        actor_id=user["id"],
        data={"message": "Ticket submitted"},
    )

    from app.workers.ticket_processor import process_ticket

    try:
        process_ticket.delay(new_ticket["id"])
    except Exception as exc:
        # Ticket creation should succeed even when worker infrastructure is down.
        logger.warning("ticket_processor_enqueue_failed", error=str(exc), ticket_id=new_ticket["id"])
    return new_ticket


@router.get("", response_model=List[TicketResponse])
async def list_tickets(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    started_ms = _now_ms()
    sb = get_admin_client()
    query = sb.table("tickets").select("*")

    if user["role"] == "customer":
        query = query.eq("submitter_id", user["id"])
    # Agents intentionally see broad ticket history in UI (queue + handled).
    # Keep strict restrictions for mutations on ticket actions.

    if status:
        query = query.eq("status", status)
    if category:
        query = query.eq("category", category)
    if search:
        query = query.or_(f"subject.ilike.%{search}%,body.ilike.%{search}%")

    start = (page - 1) * page_size
    end = start + page_size - 1
    response = query.order("created_at", desc=True).range(start, end).execute()
    items = response.data or []
    logger.info(
        "tickets_list_timing",
        duration_ms=_now_ms() - started_ms,
        role=user["role"],
        page=page,
        page_size=page_size,
        count=len(items),
        status_filter=status,
        category_filter=category,
        has_search=bool(search),
    )
    return items


@router.get("/queue")
async def get_ticket_queue(
    status: Optional[str] = Query(None, description="Comma-separated statuses"),
    priority: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: str = Query("sla_deadline", pattern="^(sla_deadline|created_at)$"),
    user: dict = Depends(get_current_user),
):
    started_ms = _now_ms()
    if not _is_agent_role(user["role"]):
        raise HTTPException(status_code=403, detail="Only agent roles can access the queue")

    sb = get_admin_client()
    query = sb.table("tickets").select(
        "*, submitter:profiles!tickets_submitter_id_fkey(email,full_name)"
    )

    if user["role"] == "agent":
        if user.get("team_id"):
            query = query.or_(
                f"assigned_team_id.eq.{user['team_id']},assigned_agent_id.eq.{user['id']},assigned_team_id.is.null"
            )

    statuses = [s.strip() for s in (status or "escalated,pending_review,reopened").split(",") if s.strip()]
    query = query.in_("status", statuses)

    if priority:
        query = query.eq("priority", priority)
    if category:
        query = query.eq("category", category)
    if search:
        query = query.or_(f"subject.ilike.%{search}%,body.ilike.%{search}%")

    start = (page - 1) * page_size
    end = start + page_size - 1
    response = query.order(sort, desc=(sort == "created_at"), nullsfirst=True).range(start, end).execute()
    items = response.data or []
    logger.info(
        "tickets_queue_timing",
        duration_ms=_now_ms() - started_ms,
        role=user["role"],
        page=page,
        page_size=page_size,
        count=len(items),
        sort=sort,
        statuses=statuses,
        priority_filter=priority,
        category_filter=category,
        has_search=bool(search),
    )
    return {"items": items, "page": page, "page_size": page_size}


@router.get("/{ticket_id}", response_model=TicketResponse)
async def get_ticket(ticket_id: str, user: dict = Depends(get_current_user)):
    ticket = _fetch_ticket_or_404(ticket_id)
    if not _can_access_ticket(user, ticket):
        raise HTTPException(status_code=403, detail="Not authorized to view this ticket")
    return ticket


@router.post("/{ticket_id}/claim")
async def claim_ticket(ticket_id: str, user: dict = Depends(get_current_user)):
    if not _is_agent_role(user["role"]):
        raise HTTPException(status_code=403, detail="Only agent roles can claim tickets")

    ticket = _fetch_ticket_or_404(ticket_id)
    if user["role"] == "agent" and user.get("team_id") and ticket.get("assigned_team_id") != user["team_id"]:
        raise HTTPException(status_code=403, detail="You can only claim tickets assigned to your team")
    if ticket.get("assigned_agent_id") and ticket.get("assigned_agent_id") != user["id"]:
        raise HTTPException(status_code=409, detail="Ticket is already claimed by another agent")
    if ticket.get("assigned_agent_id") == user["id"]:
        return ticket

    sb = get_admin_client()
    response = (
        sb.table("tickets")
        .update({"assigned_agent_id": user["id"], "status": "pending_review"})
        .eq("id", ticket_id)
        .is_("assigned_agent_id", "null")
        .execute()
    )
    if not response.data:
        latest = _fetch_ticket_or_404(ticket_id)
        if latest.get("assigned_agent_id") and latest.get("assigned_agent_id") != user["id"]:
            raise HTTPException(status_code=409, detail="Ticket was claimed by another agent")
        raise HTTPException(status_code=500, detail="Failed to claim ticket")

    _log_event(ticket_id, "assigned", "user", user["id"], {"assigned_agent_id": user["id"]})
    create_notification(
        user_id=user["id"],
        notification_type="ticket_assigned",
        title="Ticket claimed",
        body=f"You claimed ticket: {ticket.get('subject', ticket_id)}",
        ticket_id=ticket_id,
        action_url=f"/agent/tickets/{ticket_id}",
    )
    return response.data[0]


@router.post("/{ticket_id}/approve", response_model=TicketResponse)
async def approve_draft(ticket_id: str, user: dict = Depends(get_current_user)):
    if not _is_agent_role(user["role"]):
        raise HTTPException(status_code=403, detail="Only agent roles can approve drafts")

    ticket = _fetch_ticket_or_404(ticket_id)
    if not _can_access_ticket(user, ticket):
        raise HTTPException(status_code=403, detail="Not authorized to approve this ticket")

    final_response = ticket.get("ai_draft") or ""
    if not final_response:
        raise HTTPException(status_code=422, detail="No AI draft available to approve")

    sb = get_admin_client()
    now_iso = datetime.now(timezone.utc).isoformat()
    response = (
        sb.table("tickets")
        .update(
            {
                "status": "resolved",
                "resolution_type": "auto",
                "final_response": final_response,
                "resolved_at": now_iso,
            }
        )
        .eq("id", ticket_id)
        .execute()
    )

    sb.table("ticket_comments").insert(
        {
            "ticket_id": ticket_id,
            "author_id": user["id"],
            "author_type": "agent",
            "body": final_response,
            "is_internal": False,
        }
    ).execute()

    _log_event(ticket_id, "draft_approved", "user", user["id"], {"used_ai_draft": True})
    create_notification(
        user_id=ticket["submitter_id"],
        notification_type="ticket_resolved",
        title="Your ticket has been resolved",
        body=ticket.get("subject"),
        ticket_id=ticket_id,
        action_url=f"/tickets/{ticket_id}",
    )
    return response.data[0]


@router.post("/{ticket_id}/edit-resolve", response_model=TicketResponse)
async def edit_and_resolve(ticket_id: str, body: EditResolvePayload, user: dict = Depends(get_current_user)):
    if not _is_agent_role(user["role"]):
        raise HTTPException(status_code=403, detail="Only agent roles can resolve tickets")

    ticket = _fetch_ticket_or_404(ticket_id)
    if not _can_access_ticket(user, ticket):
        raise HTTPException(status_code=403, detail="Not authorized to resolve this ticket")

    sb = get_admin_client()
    now_iso = datetime.now(timezone.utc).isoformat()
    response = (
        sb.table("tickets")
        .update(
            {
                "status": "resolved",
                "resolution_type": "hybrid",
                "final_response": body.final_response,
                "resolution_notes": body.resolution_notes,
                "resolved_at": now_iso,
            }
        )
        .eq("id", ticket_id)
        .execute()
    )

    sb.table("ticket_comments").insert(
        {
            "ticket_id": ticket_id,
            "author_id": user["id"],
            "author_type": "agent",
            "body": body.final_response,
            "is_internal": False,
        }
    ).execute()

    _log_event(ticket_id, "draft_edited", "user", user["id"], {"resolution_notes": body.resolution_notes})
    create_notification(
        user_id=ticket["submitter_id"],
        notification_type="ticket_resolved",
        title="Your ticket has been resolved",
        body=ticket.get("subject"),
        ticket_id=ticket_id,
        action_url=f"/tickets/{ticket_id}",
    )
    return response.data[0]


@router.post("/{ticket_id}/reject", response_model=TicketResponse)
async def reject_draft(ticket_id: str, body: RejectDraftPayload, user: dict = Depends(get_current_user)):
    if not _is_agent_role(user["role"]):
        raise HTTPException(status_code=403, detail="Only agent roles can reject drafts")

    ticket = _fetch_ticket_or_404(ticket_id)
    if not _can_access_ticket(user, ticket):
        raise HTTPException(status_code=403, detail="Not authorized to reject this ticket")

    sb = get_admin_client()
    next_status = "routing" if body.retry else "pending_review"
    response = sb.table("tickets").update({"status": next_status}).eq("id", ticket_id).execute()

    sb.table("ticket_comments").insert(
        {
            "ticket_id": ticket_id,
            "author_id": user["id"],
            "author_type": "agent",
            "body": f"Draft rejected. Feedback: {body.feedback}",
            "is_internal": True,
        }
    ).execute()

    _log_event(ticket_id, "draft_rejected", "user", user["id"], {"feedback": body.feedback, "retry": body.retry})

    if body.retry:
        from app.workers.ticket_processor import process_ticket

        process_ticket.delay(ticket_id)
    return response.data[0]


@router.post("/{ticket_id}/reopen", response_model=TicketResponse)
async def reopen_ticket(ticket_id: str, body: ReopenPayload, user: dict = Depends(get_current_user)):
    ticket = _fetch_ticket_or_404(ticket_id)
    is_customer_owner = user["role"] == "customer" and ticket["submitter_id"] == user["id"]

    if not is_customer_owner and not _is_agent_role(user["role"]):
        raise HTTPException(status_code=403, detail="Not authorized to reopen this ticket")

    sb = get_admin_client()
    response = (
        sb.table("tickets")
        .update({"status": "reopened", "resolved_at": None, "closed_at": None})
        .eq("id", ticket_id)
        .execute()
    )

    _log_event(ticket_id, "reopened", "user", user["id"], {"reason": body.reason})
    notify_team(
        team_id=ticket.get("assigned_team_id"),
        notification_type="ticket_reopened",
        title="Ticket reopened by customer",
        body=ticket.get("subject"),
        ticket_id=ticket_id,
        action_url=f"/agent/tickets/{ticket_id}",
    )

    from app.workers.ticket_processor import process_ticket

    process_ticket.delay(ticket_id)
    return response.data[0]


@router.post("/{ticket_id}/feedback", response_model=TicketResponse)
async def submit_feedback(ticket_id: str, body: FeedbackPayload, user: dict = Depends(get_current_user)):
    ticket = _fetch_ticket_or_404(ticket_id)
    if user["role"] != "customer" or ticket["submitter_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized to provide feedback for this ticket")

    score = 5 if body.helpful else 1
    sb = get_admin_client()
    response = (
        sb.table("tickets")
        .update({"customer_feedback": body.comment, "feedback_score": score})
        .eq("id", ticket_id)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to submit feedback")

    _log_event(
        ticket_id=ticket_id,
        event_type="feedback_logged",
        actor_type="user",
        actor_id=user["id"],
        data={"helpful": body.helpful, "comment": body.comment},
    )
    return response.data[0]
