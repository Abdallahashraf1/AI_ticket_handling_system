import asyncio
import structlog
from app.celery_app import celery_app
from app.db.supabase import get_supabase
from app.agents.graph import ticket_pipeline
from app.agents.state import TicketAgentState

logger = structlog.get_logger()

async def async_process_ticket(ticket_id: str):
    logger.info("Starting async_process_ticket", ticket_id=ticket_id)
    supabase = get_supabase()
    
    try:
        response = supabase.table('tickets').select("*").eq("id", ticket_id).single().execute()
        ticket = response.data
    except Exception as e:
        logger.error("Failed to fetch ticket from DB", error=str(e))
        return

    if not ticket:
        logger.warning("Ticket not found in DB")
        return

    # Initialize state
    state = TicketAgentState(
        ticket_id=ticket['id'],
        subject=ticket.get('subject', ''),
        body=ticket.get('body', ''),
        submitter_id=ticket.get('submitter_id', ''),
        # Defaults
        duplicate_of=None,
        rag_context="",
        category=ticket.get('category'),
        subcategory=ticket.get('subcategory'),
        priority=ticket.get('priority', 'low'),
        urgency_score=ticket.get('urgency_score', 0.0),
        sentiment="neutral",
        routing_decision=None,
        draft_response=None,
        escalation_reason=None,
        assigned_team=None,
        sla_deadline=None,
        messages=[]
    )
    
    # Run the pipeline
    try:
        final_state = await ticket_pipeline.ainvoke(state)
        logger.info("Finished running LangGraph pipeline", state=final_state)
    except Exception as e:
        logger.error("Error executing LangGraph pipeline", error=str(e))

@celery_app.task(name="process_ticket_task")
def process_ticket(ticket_id: str):
    """Celery task entrypoint."""
    logger.info("Received ticket for processing", ticket_id=ticket_id)
    asyncio.run(async_process_ticket(ticket_id))
