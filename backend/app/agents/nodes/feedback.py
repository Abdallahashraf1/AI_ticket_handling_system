import structlog
from app.agents.state import TicketAgentState
from app.db.supabase import get_supabase

logger = structlog.get_logger()

async def feedback_node(state: TicketAgentState) -> TicketAgentState:
    logger.info("Starting feedback_node", ticket_id=state['ticket_id'])
    
    supabase = get_supabase()
    
    # Log outcome event
    event_payload = {
        "ticket_id": state['ticket_id'],
        "event_type": "pipeline_completed",
        "actor_type": "ai",
        "actor_id": "agent-feedback"
    }
    supabase.table('ticket_events').insert(event_payload).execute()
    
    # In Phase 3, this is where we would automatically generate a KB article if auto-resolved with high confidence.
    
    return state
