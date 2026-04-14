import structlog
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.output_parsers import JsonOutputParser
from app.agents.state import TicketAgentState
from app.agents.prompts.resolver import RESOLVER_SYSTEM_PROMPT
from app.agents.tools.rag_search import search_knowledge_base
from app.db.supabase_client import get_supabase

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
    
    from datetime import datetime, timezone
    
    try:
        supabase.table('tickets').update({
            "status": "resolved",
            "ai_draft": draft_response,
            "resolved_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", state['ticket_id']).execute()
    except Exception as e:
        logger.error("Failed to update ticket record", error=str(e))
    
    # 4. Post public comment for the customer
    comment_payload = {
        "ticket_id": state['ticket_id'],
        "body": draft_response,
        "author_type": "ai",
        "is_internal": False
    }
    try:
        supabase.table('ticket_comments').insert(comment_payload).execute()
    except Exception as e:
        logger.warning("Failed to insert comment", error=str(e))
    
    # 4. Update state and return
    return {
        "rag_context": rag_context,
        "draft_response": draft_response
    }
