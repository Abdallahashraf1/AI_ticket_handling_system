from __future__ import annotations

import hashlib
from time import time

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.db.redis import get_redis


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not path.startswith("/api/") or path.startswith("/api/v1/health"):
            return await call_next(request)

        authorization = request.headers.get("authorization", "")
        token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else ""
        identity = _hash_token(token) if token else (request.client.host if request.client else "anonymous")
        redis_client = await get_redis()

        per_minute_key = f"rate:{identity}:{int(time() // 60)}"
        requests_per_minute = await redis_client.incr(per_minute_key)
        if requests_per_minute == 1:
            await redis_client.expire(per_minute_key, 61)
        if requests_per_minute > settings.RATE_LIMIT_REQUESTS_PER_MINUTE:
            return JSONResponse(
                status_code=429,
                content={
                    "error": {
                        "code": "RATE_LIMIT_EXCEEDED",
                        "message": "Too many requests. Please slow down.",
                    }
                },
            )

        if request.method == "POST" and path == "/api/v1/tickets":
            submission_window = int(time() // 3600)
            submit_key = f"rate:tickets:{identity}:{submission_window}"
            submissions = await redis_client.incr(submit_key)
            if submissions == 1:
                await redis_client.expire(submit_key, 3601)
            if submissions > settings.RATE_LIMIT_TICKET_SUBMISSIONS_PER_HOUR:
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": {
                            "code": "TICKET_SUBMISSION_LIMIT",
                            "message": "Ticket submission limit reached for this hour.",
                        }
                    },
                )

        return await call_next(request)
