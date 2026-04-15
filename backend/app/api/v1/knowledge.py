"""
Knowledge Base API (Phase 3)
Endpoints: CRUD for articles, document upload, feedback.
"""
import io
import structlog
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from typing import List, Optional

from app.models.knowledge import ArticleCreate, ArticleUpdate, ArticleResponse, FeedbackCreate
from app.middleware.auth import get_current_user
from app.services import knowledge_service
from app.services.document_parser import parse_text

logger = structlog.get_logger()
router = APIRouter()

ALLOWED_UPLOAD_TYPES = {"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "text/markdown"}
ALLOWED_EXTENSIONS = {"pdf", "docx", "txt", "md", "markdown"}


# ─── Article CRUD ────────────────────────────────────────────────────────────

@router.post("", response_model=ArticleResponse)
async def create_article(body: ArticleCreate, user: dict = Depends(get_current_user)):
    """Create a KB article (agents/managers only)."""
    if user["role"] not in ("agent", "manager", "admin"):
        raise HTTPException(status_code=403, detail="Only agents can create KB articles")

    article = knowledge_service.create_article(
        title=body.title,
        content=body.content,
        author_id=user["id"],
        category=body.category,
        tags=body.tags,
        status=body.status,
        source_type=body.source_type,
    )

    if body.status == "active":
        # Kick off chunking + embedding asynchronously
        try:
            knowledge_service.process_article_chunks(article["id"])
        except Exception as e:
            logger.warning("Failed to trigger chunking", error=str(e))

    return article


@router.get("", response_model=List[ArticleResponse])
async def list_articles(
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="draft|active|archived"),
    search: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    articles = knowledge_service.list_articles(category=category, status=status, search=search, limit=limit, offset=offset)
    return articles


@router.get("/{article_id}", response_model=ArticleResponse)
async def get_article(article_id: str, user: dict = Depends(get_current_user)):
    try:
        return knowledge_service.get_article(article_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Article not found")


@router.put("/{article_id}", response_model=ArticleResponse)
async def update_article(article_id: str, body: ArticleUpdate, user: dict = Depends(get_current_user)):
    if user["role"] not in ("agent", "manager", "admin"):
        raise HTTPException(status_code=403, detail="Only agents can update KB articles")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=422, detail="No fields to update")

    article = knowledge_service.update_article(article_id, updates)

    # Re-process chunks if content changed or status set to active
    if "content" in updates or updates.get("status") == "active":
        try:
            knowledge_service.process_article_chunks(article_id)
        except Exception as e:
            logger.warning("Failed to re-trigger chunking on update", error=str(e))

    return article


@router.delete("/{article_id}")
async def archive_article(article_id: str, user: dict = Depends(get_current_user)):
    if user["role"] not in ("agent", "manager", "admin"):
        raise HTTPException(status_code=403, detail="Only agents can archive KB articles")
    knowledge_service.update_article(article_id, {"status": "archived"})
    return {"message": "Article archived"}


# ─── Document Upload ──────────────────────────────────────────────────────────

@router.post("/upload", response_model=ArticleResponse)
async def upload_document(
    file: UploadFile = File(...),
    category: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Upload a PDF/DOCX/TXT/MD file and convert it to a KB article."""
    if user["role"] not in ("agent", "manager", "admin"):
        raise HTTPException(status_code=403, detail="Only agents can upload documents")

    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail=f"Unsupported file type: .{ext}")

    content_bytes = await file.read()
    try:
        text_content = parse_text(content_bytes, file.filename)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Use filename (without extension) as title
    title = file.filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").title()

    article = knowledge_service.create_article(
        title=title,
        content=text_content,
        author_id=user["id"],
        category=category,
        status="active",
        source_type="upload",
    )

    # Kick off embedding pipeline immediately for uploaded articles
    try:
        knowledge_service.process_article_chunks(article["id"])
    except Exception as e:
        logger.warning("Failed to trigger chunking after upload", error=str(e))

    return article
