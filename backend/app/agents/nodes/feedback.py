import structlog
from app.agents.state import TicketAgentState
from app.db.supabase_client import get_supabase

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
    
    # 3.6 - Feedback-Driven KB Growth
    # Automatically generate a KB article if auto-resolved.
    # We treat the draft response as the basis for a potential new KB article.
    if state.get("routing_decision") == "auto_resolve" and state.get("draft_response"):
        try:
            from app.services.knowledge_service import create_article, process_article_chunks
            
            # Create a "draft" KB article from this resolution
            kb_title = f"Resolution: {state['subject']}"
            kb_content = state['draft_response']
            
            article = create_article(
                title=kb_title,
                content=kb_content,
                category=state.get("category"),
                tags=["auto-generated", f"ticket-{state['ticket_id']}"],
                status="draft", # Keep as draft for human review
                source_type="auto_resolved"
            )
            
            logger.info("Auto-generated KB article draft", article_id=article["id"], ticket_id=state['ticket_id'])
        except Exception as e:
            logger.warning("Failed to auto-generate KB article", error=str(e))
    
    return state
