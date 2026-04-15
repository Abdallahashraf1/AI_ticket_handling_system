from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class ArticleCreate(BaseModel):
    title: str
    content: str
    category: Optional[str] = None
    tags: Optional[List[str]] = []
    status: str = "draft"
    source_type: str = "manual"


class ArticleUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = None


class ArticleResponse(BaseModel):
    id: str
    title: str
    content: str
    category: Optional[str] = None
    tags: Optional[List[str]] = []
    status: str
    author_id: Optional[str] = None
    helpfulness_score: Optional[float] = None
    source_type: Optional[str] = "manual"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ArticleList(BaseModel):
    items: List[ArticleResponse]
    total: int


class FeedbackCreate(BaseModel):
    helpful: bool
    comment: Optional[str] = None
