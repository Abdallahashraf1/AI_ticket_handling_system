from typing import TypedDict, Annotated, Optional, Sequence
from operator import add
from langchain_core.messages import BaseMessage

class TicketAgentState(TypedDict):
    """LangGraph state for the ticket processing pipeline."""
    
    # Input
    ticket_id: str
    subject: str
    body: str
    submitter_id: str
    
    # Context injected by tools
    duplicate_of: Optional[str]
    rag_context: str
    
    # Agent outputs
    category: Optional[str]
    subcategory: Optional[str]
    priority: Optional[str]
    urgency_score: Optional[float]
    sentiment: Optional[str]
    
    # Routing decisions
    routing_decision: Optional[str] # e.g. "auto_resolve", "escalate"
    
    # Resolution/Escalation
    draft_response: Optional[str]
    escalation_reason: Optional[str]
    assigned_team: Optional[str]
    sla_deadline: Optional[str]
    
    # Messages trail (for more complex conversational agents if needed later)
    messages: Annotated[Sequence[BaseMessage], add]
