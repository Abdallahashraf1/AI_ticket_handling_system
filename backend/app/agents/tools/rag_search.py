"""
Full RAG Search implementation using pgvector (Phase 3)
Replaces the stub from Phase 2.
"""
import structlog
from app.db.supabase_client import get_supabase
from app.config import settings

logger = structlog.get_logger()

SIMILARITY_THRESHOLD = 0.7
MAX_RESULTS = 5


def _embed_query(text: str) -> list[float]:
    """Generate a query embedding using the new Gemini SDK."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    response = client.models.embed_content(
        model="gemini-embedding-001",
        contents=text,
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_QUERY",
            output_dimensionality=1536
        )
    )
    return response.embeddings[0].values


async def search_knowledge_base(query: str, threshold: float = SIMILARITY_THRESHOLD, limit: int = MAX_RESULTS) -> str:
    """
    Full pgvector similarity search against knowledge_chunks.
    Returns a formatted context string for the resolver agent.
    """
    try:
        embedding = _embed_query(query)
    except Exception as e:
        logger.warning("Failed to generate query embedding for RAG", error=str(e))
        return "No knowledge base articles found. Proceed with standard response guidelines."

    sb = get_supabase()

    try:
        result = sb.rpc("match_knowledge_chunks", {
            "query_embedding": embedding,
            "match_threshold": threshold,
            "match_count": limit,
        }).execute()

        chunks = result.data or []
    except Exception as e:
        logger.error("RAG search failed", error=str(e))
        return "Knowledge base search unavailable. Proceed with standard response guidelines."

    if not chunks:
        return "No relevant knowledge base articles found. Proceed with standard response guidelines."

    # Format context for the LLM
    context_parts = []
    seen_articles: set[str] = set()

    for chunk in chunks:
        article_id = chunk.get("article_id", "")
        title = chunk.get("article_title", "Untitled")
        section = chunk.get("section", "")
        content = chunk.get("chunk_content", "")
        similarity = chunk.get("similarity", 0.0)
        tags = chunk.get("article_tags") or []

        header = f"[Article: {title}"
        if section:
            header += f" > {section}"
        header += f"] (relevance: {similarity:.0%})"

        if tags:
            header += f" [tags: {', '.join(tags)}]"

        context_parts.append(f"{header}\n{content}")

        if article_id not in seen_articles:
            seen_articles.add(article_id)

    context = "\n\n---\n\n".join(context_parts)
    logger.info("RAG search complete", query_preview=query[:60], num_chunks=len(chunks), articles=len(seen_articles))
    return context
