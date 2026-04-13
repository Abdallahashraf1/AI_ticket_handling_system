from fastapi import APIRouter
from app.api.v1.health import router as health_router
from app.api.v1.tickets import router as tickets_router

api_router = APIRouter()
api_router.include_router(health_router, prefix="/v1/health", tags=["health"])
api_router.include_router(tickets_router, prefix="/v1/tickets", tags=["tickets"])
