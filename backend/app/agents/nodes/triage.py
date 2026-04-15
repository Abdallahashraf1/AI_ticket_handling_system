import json
import structlog
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.output_parsers import JsonOutputParser
from app.agents.state import TicketAgentState
from app.agents.prompts.triage import TRIAGE_SYSTEM_PROMPT
from app.agents.tools.duplicate_detector import find_duplicates
from app.db.supabase_client import get_supabase

logger = structlog.get_logger()

async def triage_node(state: TicketAgentState) -> TicketAgentState:
    logger.info("Starting triage_node", ticket_id=state['ticket_id'])
    
    # 1. Look for duplicates
    dup_id = await find_duplicates(state['subject'], state['body'], state['submitter_id'])
    
    # 2. Invoke LLM for classification
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
    messages = [
        SystemMessage(content=TRIAGE_SYSTEM_PROMPT),
        HumanMessage(content=f"Ticket Subject: {state['subject']}\nTicket Body: {state['body']}")
    ]
    
    # Enable JSON mode by forcing it down if necessary, else we parse after
    parser = JsonOutputParser()
    chain = llm | parser
    
    try:
        result = await chain.ainvoke(messages)
    except Exception as e:
        logger.error("Error invoking LLM in triage", error=str(e))
        result = {
            "category": "general",
            "subcategory": "unknown",
            "priority": "medium",
            "urgency_score": 0.5,
            "sentiment": "neutral",
            "reasoning": "Fallback due to LLM error"
        }

    # 3. Update Supabase
    supabase = get_supabase()
    
    # We update the ticket record
    try:
        supabase.table('tickets').update({
            "category": result.get('category'),
            "subcategory": result.get('subcategory'),
            "priority": result.get('priority'),
            "urgency_score": result.get('urgency_score'),
            "sentiment": result.get('sentiment'),
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
    
    # 4. Update state and return
    return {
        "duplicate_of": dup_id,
        "category": result.get('category'),
        "subcategory": result.get('subcategory'),
        "priority": result.get('priority'),
        "urgency_score": result.get('urgency_score'),
        "sentiment": result.get('sentiment')
    }
