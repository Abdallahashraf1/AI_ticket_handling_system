from fastapi import APIRouter
from app.api.v1.health import router as health_router
from app.api.v1.tickets import router as tickets_router
from app.api.v1.knowledge import router as knowledge_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.manager import router as manager_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.sla import router as sla_router

api_router = APIRouter()
api_router.include_router(health_router, prefix="/v1/health", tags=["health"])
api_router.include_router(tickets_router, prefix="/v1/tickets", tags=["tickets"])
api_router.include_router(knowledge_router, prefix="/v1/knowledge", tags=["knowledge"])
api_router.include_router(notifications_router, prefix="/v1/notifications", tags=["notifications"])
api_router.include_router(manager_router, prefix="/v1/manager", tags=["manager"])
api_router.include_router(analytics_router, prefix="/v1/analytics", tags=["analytics"])
api_router.include_router(sla_router, prefix="/v1/sla", tags=["sla"])
