from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.middleware.auth import require_role
from app.services.analytics_service import AnalyticsService, AnalyticsValidationError

router = APIRouter()
analytics_service = AnalyticsService()


class AnalyticsQueryRequest(BaseModel):
    question: str = Field(min_length=3)


@router.post("/query")
async def analytics_query(
    body: AnalyticsQueryRequest,
    user: dict = Depends(require_role("manager", "admin")),
):
    try:
        return await analytics_service.query_from_natural_language(body.question)
    except AnalyticsValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to process analytics query: {exc}")


@router.get("/dashboard")
async def analytics_dashboard(user: dict = Depends(require_role("manager", "admin"))):
    try:
        return await analytics_service.get_dashboard_data()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load analytics dashboard: {exc}")

