"""
Embedding Worker (Phase 3)
Celery task: fetches unembedded chunks for an article, generates Gemini embeddings, stores them.
"""
import structlog
from app.celery_app import celery_app
from app.db.supabase_client import get_supabase
from app.config import settings

logger = structlog.get_logger()

BATCH_SIZE = 50  # Gemini allows up to 100 per batch; use 50 to be safe


def _get_client():
    from google import genai
    return genai.Client(api_key=settings.GEMINI_API_KEY)


def _get_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a batch of texts using the new GenAI SDK."""
    from google.genai import types
    client = _get_client()

    response = client.models.embed_content(
        model="gemini-embedding-001",
        contents=texts,
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_DOCUMENT",
            output_dimensionality=1536
        )
    )
    
    # The SDK returns a list of embeddings
    return [e.values for e in response.embeddings]


@celery_app.task(name="generate_embeddings_for_article", bind=True, max_retries=3)
def generate_embeddings_for_article(self, article_id: str):
    """Celery task: generate and store embeddings for all chunks of an article."""
    logger.info("Starting embedding generation", article_id=article_id)
    sb = get_supabase()

    # Fetch all chunks without embeddings
    result = sb.table("knowledge_chunks").select("id, content").eq("article_id", article_id).is_("embedding", "null").execute()
    chunks = result.data or []

    if not chunks:
        logger.info("No chunks to embed", article_id=article_id)
        return

    logger.info("Embedding chunks", article_id=article_id, count=len(chunks))

    try:
        for i in range(0, len(chunks), BATCH_SIZE):
            batch = chunks[i: i + BATCH_SIZE]
            texts = [c["content"] for c in batch]
            embeddings = _get_embeddings_batch(texts)

            for chunk, embedding in zip(batch, embeddings):
                sb.table("knowledge_chunks").update({
                    "embedding": embedding
                }).eq("id", chunk["id"]).execute()

        logger.info("Finished embedding generation", article_id=article_id, total=len(chunks))

    except Exception as exc:
        logger.error("Embedding generation failed", article_id=article_id, error=str(exc))
        raise self.retry(exc=exc, countdown=30)
