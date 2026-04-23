import redis.asyncio as redis
import redis as redis_sync
from app.config import settings

_redis_client = None
_redis_sync_client = None

async def get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


def get_redis_sync() -> redis_sync.Redis:
    global _redis_sync_client
    if _redis_sync_client is None:
        _redis_sync_client = redis_sync.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_sync_client
