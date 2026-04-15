import structlog
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.output_parsers import JsonOutputParser
from app.agents.state import TicketAgentState
from app.agents.prompts.escalation import ESCALATION_SYSTEM_PROMPT
from app.agents.tools.sla_calculator import calculate_sla_deadline
from app.agents.tools.notifier import send_notification
from app.db.supabase_client import get_supabase

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
    team_id = None
    try:
        team_lookup = supabase.table("teams").select("id").eq("name", assigned_team).limit(1).execute()
        if team_lookup.data:
            team_id = team_lookup.data[0]["id"]
    except Exception as e:
        logger.warning("Failed to map assigned team name to ID", error=str(e), assigned_team=assigned_team)
    
    try:
        supabase.table('tickets').update({
            "status": "escalated",
            "ai_draft": escalation_reason,
            "assigned_team_id": team_id,
            "sla_deadline": sla_deadline.isoformat()
        }).eq("id", state['ticket_id']).execute()
    except Exception as e:
        logger.error("Failed to update ticket in escalation", error=str(e))
    
    # Insert internal comment for the agent
    comment_payload = {
        "ticket_id": state['ticket_id'],
        "body": f"AI ESCALATION BRIEF:\n{escalation_reason}",
        "author_type": "ai",
        "is_internal": True
    }
    try:
        supabase.table('ticket_comments').insert(comment_payload).execute()
    except Exception as e:
        logger.warning("Failed to insert internal comment", error=str(e))
    
    # 4. Notify Team
    await send_notification(state['ticket_id'], escalation_reason, assigned_team)
    
    # 5. Update state and return
    return {
        "escalation_reason": escalation_reason,
        "assigned_team": assigned_team,
        "sla_deadline": sla_deadline
    }
