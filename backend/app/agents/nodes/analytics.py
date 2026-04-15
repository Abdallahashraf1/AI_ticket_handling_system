from typing import Any, Dict

import structlog
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import JsonOutputParser
from langchain_google_genai import ChatGoogleGenerativeAI

from app.agents.prompts.analytics import ANALYTICS_SYSTEM_PROMPT

logger = structlog.get_logger()


async def run_analytics_query(question: str) -> Dict[str, Any]:
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
    parser = JsonOutputParser()
    chain = llm | parser
    try:
        result = await chain.ainvoke(
            [
                SystemMessage(content=ANALYTICS_SYSTEM_PROMPT),
                HumanMessage(content=f"Question: {question}"),
            ]
        )
        return {
            "sql_query": result.get("sql_query", ""),
            "explanation": result.get("explanation", ""),
            "chart_type": result.get("chart_type"),
        }
    except Exception as exc:
        logger.error("analytics_llm_generation_failed", error=str(exc))
        raise

