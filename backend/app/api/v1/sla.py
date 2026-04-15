from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.middleware.auth import require_role
from app.services.sla_service import SLAService

router = APIRouter()
sla_service = SLAService()


class SLAPolicyPayload(BaseModel):
    name: str = Field(min_length=2)
    priority: str = Field(pattern="^(critical|high|medium|low)$")
    first_response_hours: int = Field(ge=1, le=720)
    resolution_hours: int = Field(ge=1, le=720)
    business_hours_only: bool = True
    is_default: bool = False


@router.get("/policies")
async def get_sla_policies(user: dict = Depends(require_role("manager", "admin"))):
    return sla_service.list_policies()


@router.post("/policies")
async def create_sla_policy(
    body: SLAPolicyPayload,
    user: dict = Depends(require_role("manager", "admin")),
):
    try:
        return sla_service.create_policy(body.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create SLA policy: {exc}")


@router.put("/policies/{policy_id}")
async def update_sla_policy(
    policy_id: str,
    body: SLAPolicyPayload,
    user: dict = Depends(require_role("manager", "admin")),
):
    try:
        return sla_service.update_policy(policy_id, body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update SLA policy: {exc}")


@router.delete("/policies/{policy_id}")
async def delete_sla_policy(
    policy_id: str,
    user: dict = Depends(require_role("manager", "admin")),
):
    try:
        sla_service.delete_policy(policy_id)
        return {"status": "deleted"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete SLA policy: {exc}")


@router.get("/dashboard")
async def sla_dashboard(user: dict = Depends(require_role("manager", "admin"))):
    return sla_service.get_sla_dashboard()


@router.post("/check")
async def run_sla_check(user: dict = Depends(require_role("manager", "admin"))):
    return sla_service.check_breaches(now=datetime.now(timezone.utc))

