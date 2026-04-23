from datetime import datetime, timezone
import structlog
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.output_parsers import JsonOutputParser
from app.agents.state import TicketAgentState
from app.agents.prompts.triage import TRIAGE_SYSTEM_PROMPT
from app.agents.tools.duplicate_detector import find_duplicates
from app.db.redis import get_redis
from app.db.supabase_client import get_supabase
from app.services.llm_resilience import LLMServiceUnavailable, invoke_json_llm
from app.services.sla_service import SLAService

logger = structlog.get_logger()

async def triage_node(state: TicketAgentState) -> TicketAgentState:
    logger.info("Starting triage_node", ticket_id=state['ticket_id'])
    
    # 1. Look for duplicates
    dup_id = await find_duplicates(state['subject'], state['body'], state['submitter_id'])
    
    # 2. Invoke LLM for classification
    messages = [
        SystemMessage(content=TRIAGE_SYSTEM_PROMPT),
        HumanMessage(content=f"Ticket Subject: {state['subject']}\nTicket Body: {state['body']}")
    ]
    
    # Enable JSON mode by forcing it down if necessary, else we parse after
    parser = JsonOutputParser()
    
    try:
        result = await invoke_json_llm(model="gemini-2.5-flash", temperature=0, messages=messages, parser=parser)
    except LLMServiceUnavailable as e:
        logger.error("Error invoking LLM in triage", error=str(e))
        result = {
            "category": "general",
            "subcategory": "unknown",
            "priority": "medium",
            "urgency_score": 0.5,
            "sentiment": "neutral",
            "reasoning": "Fallback due to LLM error"
        }

    # 3. Calculate SLA once priority is known so every triaged ticket is SLA-tracked.
    supabase = get_supabase()
    sla_deadline_iso = None
    try:
        ticket_response = supabase.table('tickets').select('created_at').eq("id", state['ticket_id']).single().execute()
        created_at_raw = (ticket_response.data or {}).get('created_at')
        created_at = (
            datetime.fromisoformat(created_at_raw.replace("Z", "+00:00"))
            if created_at_raw
            else datetime.now(timezone.utc)
        )
        sla_deadline = SLAService().calculate_deadline(result.get('priority') or 'medium', created_at)
        sla_deadline_iso = sla_deadline.isoformat()
    except Exception as e:
        logger.warning("Failed to calculate SLA deadline in triage", error=str(e), ticket_id=state['ticket_id'])
    
    # 4. Update Supabase
    try:
        supabase.table('tickets').update({
            "category": result.get('category'),
            "subcategory": result.get('subcategory'),
            "priority": result.get('priority'),
            "urgency_score": result.get('urgency_score'),
            "sentiment": result.get('sentiment'),
            "sla_deadline": sla_deadline_iso,
            "status": "triaged"
        }).eq("id", state['ticket_id']).execute()
    except Exception as e:
        logger.error("Failed to update ticket in triage", error=str(e))
    
    # Insert event
    event_payload = {
        "ticket_id": state['ticket_id'],
        "event_type": "triaged",
        "actor_type": "ai",
        "actor_id": "agent-triage"
    }
    supabase.table('ticket_events').insert(event_payload).execute()

    # Dashboard data is cached in Redis; clear it when ticket analytics fields change.
    try:
        redis_client = await get_redis()
        await redis_client.delete("analytics:dashboard:default")
    except Exception as e:
        logger.warning("Failed to invalidate analytics dashboard cache", error=str(e))
    
    # 5. Update state and return
    return {
        "duplicate_of": dup_id,
        "category": result.get('category'),
        "subcategory": result.get('subcategory'),
        "priority": result.get('priority'),
        "urgency_score": result.get('urgency_score'),
        "sentiment": result.get('sentiment'),
        "sla_deadline": sla_deadline_iso
    }
