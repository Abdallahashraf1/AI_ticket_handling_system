import asyncio
import structlog
from app.celery_app import celery_app
from app.db.supabase_client import get_supabase
from app.agents.graph import ticket_pipeline
from app.agents.state import TicketAgentState
from app.services.llm_resilience import LLMServiceUnavailable
from app.services.ticket_service import mark_ticket_retry, move_ticket_to_dead_letter

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
        return {"status": "completed"}
    except LLMServiceUnavailable as e:
        logger.warning("LLM unavailable, deferring ticket processing", ticket_id=ticket_id, error=str(e))
        raise
    except Exception as e:
        logger.error("Error executing LangGraph pipeline", error=str(e))
        raise

@celery_app.task(bind=True, name="process_ticket_task", max_retries=5)
def process_ticket(self, ticket_id: str):
    """Celery task entrypoint."""
    attempt = self.request.retries + 1
    logger.info("Received ticket for processing", ticket_id=ticket_id, attempt=attempt)
    try:
        asyncio.run(async_process_ticket(ticket_id))
    except LLMServiceUnavailable as exc:
        if self.request.retries >= self.max_retries:
            asyncio.run(move_ticket_to_dead_letter(ticket_id, str(exc), attempt))
            return
        mark_ticket_retry(ticket_id, attempt, str(exc))
        countdown = min(2 ** self.request.retries, 60)
        raise self.retry(exc=exc, countdown=countdown)
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            asyncio.run(move_ticket_to_dead_letter(ticket_id, str(exc), attempt))
            return
        mark_ticket_retry(ticket_id, attempt, str(exc))
        countdown = min(2 ** self.request.retries, 60)
        raise self.retry(exc=exc, countdown=countdown)
