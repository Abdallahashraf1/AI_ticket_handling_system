import structlog
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.output_parsers import JsonOutputParser
from app.agents.state import TicketAgentState
from app.agents.prompts.resolver import RESOLVER_SYSTEM_PROMPT
from app.agents.tools.rag_search import search_knowledge_base
from app.db.supabase import get_supabase

logger = structlog.get_logger()

async def resolver_node(state: TicketAgentState) -> TicketAgentState:
    logger.info("Starting resolver_node", ticket_id=state['ticket_id'])
    
    # 1. RAG Search
    rag_context = await search_knowledge_base(state['subject'] + " " + state['body'])
    
    # 2. Invoke LLM for resolution draft
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.3)
    messages = [
        SystemMessage(content=RESOLVER_SYSTEM_PROMPT),
        HumanMessage(content=f"Knowledge Base Context:\n{rag_context}\n\nTicket Subject: {state['subject']}\nTicket Body: {state['body']}")
    ]
    
    parser = JsonOutputParser()
    chain = llm | parser
    
    try:
        result = await chain.ainvoke(messages)
        draft_response = result.get('draft_response', 'We are looking into your issue.')
    except Exception as e:
        logger.error("Error invoking LLM in resolver", error=str(e))
        draft_response = "We have received your ticket and are investigating."

    # 3. Update Supabase
    supabase = get_supabase()
    
    supabase.table('tickets').update({
        "status": "resolved"
    }).eq("id", state['ticket_id']).execute()
    
    event_payload = {
        "ticket_id": state['ticket_id'],
        "event_type": "auto_resolved",
        "actor_type": "ai",
        "actor_id": "agent-resolver"
    }
    supabase.table('ticket_events').insert(event_payload).execute()
    
    # Optionally save the draft response as a comment
    comment_payload = {
        "ticket_id": state['ticket_id'],
        "body": draft_response,
        "author_id": "agent-resolver", # Assuming the AI has this UUID or we just track it some other way
        "is_internal": False
    }
    try:
        supabase.table('ticket_comments').insert(comment_payload).execute()
    except Exception as e:
        logger.warning("Failed to insert comment, might need AI user setup", error=str(e))
    
    # 4. Update state and return
    return {
        "rag_context": rag_context,
        "draft_response": draft_response
    }
