from celery import Celery
from app.config import settings

celery_app = Celery(
    "tickets_worker",
    broker=settings.CELERY_BROKER_URL,
    include=[
        "app.workers.ticket_processor",
        "app.workers.embedding_worker"
    ]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)
