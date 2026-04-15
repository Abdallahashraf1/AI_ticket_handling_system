import asyncio
from datetime import datetime, timezone

import structlog

from app.config import settings
from app.services.sla_service import SLAService

logger = structlog.get_logger()


async def sla_checker_loop() -> None:
    service = SLAService()
    interval = max(settings.SLA_CHECK_INTERVAL_SECONDS, 10)
    logger.info("sla_checker_started", interval_seconds=interval)
    while True:
        started = datetime.now(timezone.utc)
        try:
            result = service.check_breaches(now=started)
            logger.info("sla_checker_cycle_complete", **result)
        except Exception as exc:
            logger.error("sla_checker_cycle_failed", error=str(exc))
        await asyncio.sleep(interval)


def main() -> None:
    asyncio.run(sla_checker_loop())


if __name__ == "__main__":
    main()

