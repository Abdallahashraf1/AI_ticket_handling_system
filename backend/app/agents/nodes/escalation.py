import structlog
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.output_parsers import JsonOutputParser
from app.agents.state import TicketAgentState
from app.agents.prompts.escalation import ESCALATION_SYSTEM_PROMPT
from app.agents.tools.sla_calculator import calculate_sla_deadline
from app.agents.tools.notifier import send_notification
from app.db.supabase import get_supabase

logger = structlog.get_logger()

async def escalation_node(state: TicketAgentState) -> TicketAgentState:
    logger.info("Starting escalation_node", ticket_id=state['ticket_id'])
    
    # 1. Invoke LLM for escalation breakdown
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
    messages = [
        SystemMessage(content=ESCALATION_SYSTEM_PROMPT),
        HumanMessage(content=f"Ticket Subject: {state['subject']}\nTicket Body: {state['body']}\nCategory: {state['category']}")
    ]
    
    parser = JsonOutputParser()
    chain = llm | parser
    
    try:
        result = await chain.ainvoke(messages)
        escalation_reason = result.get('escalation_reason', 'Complex issue requiring human review.')
        assigned_team = result.get('assigned_team', 'General Support')
    except Exception as e:
        logger.error("Error invoking LLM in escalation", error=str(e))
        escalation_reason = "Fallback logic activated for escalation."
        assigned_team = "General Support"

    # 2. SLA Calculation
    sla_deadline = calculate_sla_deadline(state.get('priority', 'medium'))

    # 3. Update Supabase
    supabase = get_supabase()
    
    supabase.table('tickets').update({
        "status": "escalated"
    }).eq("id", state['ticket_id']).execute()
    
    # Insert internal comment for the agent
    comment_payload = {
        "ticket_id": state['ticket_id'],
        "body": f"ESCALATION SUMMARY:\n{escalation_reason}\n\nAssigned to: {assigned_team}\nSLA Deadline: {sla_deadline}",
        "author_id": "agent-escalation", # Assuming System/AI UUID
        "is_internal": True
    }
    try:
        supabase.table('ticket_comments').insert(comment_payload).execute()
    except Exception:
        pass
    
    event_payload = {
        "ticket_id": state['ticket_id'],
        "event_type": "escalated",
        "actor_type": "ai",
        "actor_id": "agent-escalation"
    }
    supabase.table('ticket_events').insert(event_payload).execute()
    
    # 4. Notify Team
    await send_notification(state['ticket_id'], escalation_reason, assigned_team)
    
    # 5. Update state and return
    return {
        "escalation_reason": escalation_reason,
        "assigned_team": assigned_team,
        "sla_deadline": sla_deadline
    }
