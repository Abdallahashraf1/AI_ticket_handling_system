from fastapi import APIRouter
from app.db.supabase_client import get_admin_client
from app.db.redis import get_redis
import structlog

router = APIRouter()
logger = structlog.get_logger()

@router.get("/")
async def health_check():
    return {"status": "healthy"}

@router.get("/ready")
async def readiness_check():
    checks = {
        "supabase": False,
        "redis": False
    }
    
    try:
        sb = get_admin_client()
        result = sb.table("teams").select("id").limit(1).execute()
        checks["supabase"] = True
    except Exception as e:
        logger.error(f"Supabase check failed: {e}")
        
    try:
        r = await get_redis()
        await r.ping()
        checks["redis"] = True
    except Exception as e:
        logger.error(f"Redis check failed: {e}")
        
    all_ready = all(checks.values())
    return {"ready": all_ready, "checks": checks}
