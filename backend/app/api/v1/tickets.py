from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.models.ticket import TicketCreate, TicketResponse
from app.middleware.auth import get_current_user
from app.db.supabase_client import get_admin_client

router = APIRouter()

@router.post("/", response_model=TicketResponse)
async def create_ticket(ticket: TicketCreate, user: dict = Depends(get_current_user)):
    sb = get_admin_client()
    
    ticket_data = {
        "subject": ticket.subject,
        "body": ticket.body,
        "submitter_id": user["id"],
        "source": "web",
        "category": ticket.category,
        "priority": ticket.priority,
        "attachments": ticket.attachments,
        "status": "new"
    }
    
    response = sb.table("tickets").insert(ticket_data).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create ticket")
        
    new_ticket = response.data[0]
    
    # create event
    event_data = {
        "ticket_id": new_ticket["id"],
        "event_type": "created",
        "actor_type": "customer" if user["role"] == "customer" else "agent",
        "actor_id": user["id"],
        "data": {"message": "Ticket submitted"}
    }
    sb.table("ticket_events").insert(event_data).execute()
    
    # Trigger celery task asynchronously
    from app.workers.ticket_processor import process_ticket
    process_ticket.delay(new_ticket["id"])
    
    return new_ticket

@router.get("/", response_model=List[TicketResponse])
async def list_tickets(user: dict = Depends(get_current_user)):
    sb = get_admin_client()
    
    query = sb.table("tickets").select("*")
    
    # basic role filtering
    if user["role"] == "customer":
        query = query.eq("submitter_id", user["id"])
    elif user["role"] == "agent" and user.get("team_id"):
        query = query.eq("assigned_team_id", user["team_id"])
        
    response = query.order("created_at", desc=True).execute()
    return response.data

@router.get("/{ticket_id}", response_model=TicketResponse)
async def get_ticket(ticket_id: str, user: dict = Depends(get_current_user)):
    sb = get_admin_client()
    
    response = sb.table("tickets").select("*").eq("id", ticket_id).single().execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Ticket not found")
        
    ticket = response.data
    
    if user["role"] == "customer" and ticket["submitter_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized to view this ticket")
        
    return ticket
