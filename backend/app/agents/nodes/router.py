import json
import structlog
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.output_parsers import JsonOutputParser
from app.agents.state import TicketAgentState
from app.agents.prompts.router import ROUTER_SYSTEM_PROMPT
from app.db.supabase_client import get_supabase
from app.services.llm_resilience import LLMServiceUnavailable, invoke_json_llm

logger = structlog.get_logger()

async def router_node(state: TicketAgentState) -> TicketAgentState:
    logger.info("Starting router_node", ticket_id=state['ticket_id'])
    
    # 1. Invoke LLM for routing
    messages = [
        SystemMessage(content=ROUTER_SYSTEM_PROMPT),
        HumanMessage(content=f"Ticket Subject: {state['subject']}\nTicket Body: {state['body']}\nCategory: {state['category']}\nPriority: {state['priority']}")
    ]
    
    parser = JsonOutputParser()
    
    try:
        result = await invoke_json_llm(model="gemini-2.5-flash", temperature=0, messages=messages, parser=parser)
        decision = result.get('decision', 'escalate')
    except LLMServiceUnavailable as e:
        logger.error("Error invoking LLM in router", error=str(e))
        decision = "escalate" # Default to escalate on failure

    # 2. Update Supabase
    supabase = get_supabase()
    
    # Insert event
    event_payload = {
        "ticket_id": state['ticket_id'],
        "event_type": f"routed_{decision}",
        "actor_type": "ai",
        "actor_id": "agent-router"
    }
    supabase.table('ticket_events').insert(event_payload).execute()
    
    # 3. Update state and return
    return {
        "routing_decision": decision
    }
