"""
Knowledge Service (Phase 3)
Handles KB article CRUD and document processing.
"""
import uuid
import structlog
from typing import Optional, List
from app.db.supabase_client import get_supabase

logger = structlog.get_logger()


def create_article(
    title: str,
    content: str,
    author_id: Optional[str] = None,
    category: Optional[str] = None,
    tags: Optional[List[str]] = None,
    status: str = "draft",
    source_type: str = "manual",
) -> dict:
    sb = get_supabase()
    payload = {
        "title": title,
        "content": content,
        "status": status,
        "source_type": source_type,
        "category": category,
        "tags": tags or [],
        "author_id": author_id,
    }
    result = sb.table("knowledge_articles").insert(payload).execute()
    if not result.data:
        raise RuntimeError("Failed to create knowledge article")
    return result.data[0]


def update_article(article_id: str, updates: dict) -> dict:
    sb = get_supabase()
    result = sb.table("knowledge_articles").update(updates).eq("id", article_id).execute()
    if not result.data:
        raise RuntimeError(f"Article {article_id} not found or update failed")
    return result.data[0]


def get_article(article_id: str) -> dict:
    sb = get_supabase()
    result = sb.table("knowledge_articles").select("*").eq("id", article_id).single().execute()
    if not result.data:
        raise ValueError(f"Article {article_id} not found")
    return result.data


def list_articles(
    category: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[dict]:
    sb = get_supabase()
    query = sb.table("knowledge_articles").select("*")
    if category:
        query = query.eq("category", category)
    if status:
        query = query.eq("status", status)
    if search:
        query = query.ilike("title", f"%{search}%")
    result = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return result.data or []


def store_chunks(article_id: str, chunks: list[dict]):
    """Store chunk records (without embeddings) in knowledge_chunks."""
    sb = get_supabase()
    rows = [
        {
            "article_id": article_id,
            "chunk_index": chunk["chunk_index"],
            "content": chunk["text"],
            "section": chunk.get("section", ""),
        }
        for chunk in chunks
    ]
    result = sb.table("knowledge_chunks").insert(rows).execute()
    return result.data or []


def process_article_chunks(article_id: str):
    """
    Called after article creation: chunk the content and enqueue embedding generation.
    """
    from app.services.chunker import chunk_article
    from app.workers.embedding_worker import generate_embeddings_for_article

    article = get_article(article_id)
    chunks = chunk_article(article["content"])

    # Delete old chunks if re-processing
    sb = get_supabase()
    sb.table("knowledge_chunks").delete().eq("article_id", article_id).execute()

    stored = store_chunks(article_id, chunks)

    # Trigger Celery embedding task
    generate_embeddings_for_article.delay(article_id)

    logger.info("Chunked article and queued embeddings", article_id=article_id, num_chunks=len(chunks))
    return len(chunks)
