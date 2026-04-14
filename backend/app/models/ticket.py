from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from uuid import UUID

class TicketCreate(BaseModel):
    subject: str
    body: str
    category: Optional[str] = None
    priority: Optional[str] = None
    attachments: Optional[List[str]] = []

class TicketResponse(BaseModel):
    id: UUID
    subject: str
    body: str
    status: str
    submitter_id: UUID
    assigned_team_id: Optional[UUID] = None
    assigned_agent_id: Optional[UUID] = None
    source: str
    attachments: List[str] = []
    category: Optional[str] = None
    subcategory: Optional[str] = None
    priority: Optional[str] = None
    urgency_score: Optional[float] = None
    sentiment: Optional[str] = None
    resolution_type: Optional[str] = None
    ai_draft: Optional[str] = None
    final_response: Optional[str] = None
    created_at: datetime
    updated_at: datetime
