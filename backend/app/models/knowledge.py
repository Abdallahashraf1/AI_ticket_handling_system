from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class ArticleCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    content: str = Field(min_length=10, max_length=20000)
    category: Optional[str] = Field(default=None, max_length=100)
    tags: Optional[List[str]] = []
    status: str = "draft"
    source_type: str = "manual"


class ArticleUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=3, max_length=200)
    content: Optional[str] = Field(default=None, min_length=10, max_length=20000)
    category: Optional[str] = Field(default=None, max_length=100)
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
