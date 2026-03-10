"""
celery_app.py — Celery application instance for LexAI backend.
Broker: Redis (configured via REDIS_URL in .env)
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from celery import Celery
from dotenv import load_dotenv

# Anchor .env loading to this file's location
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=True)

REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")

# Ensure current directory is in sys.path for Windows
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

celery_app = Celery(
    "lexai",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["workers.pipeline_worker"],
)

celery_app.conf.update(
    # Task routing
    task_routes={
        "workers.pipeline_worker.run_pipeline_task": {"queue": "pipeline"},
    },
    task_queues={
        "pipeline": {"exchange": "pipeline", "routing_key": "pipeline"},
    },
    task_default_queue="pipeline",

    # Serialisation
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # Reliability
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_reject_on_worker_lost=True,

    # Results expire after 1 hour (we use Redis SSE, not polling)
    result_expires=3600,

    # Windows-safe: use solo pool when running locally
    # Override with --pool=prefork on Linux
    worker_pool="solo" if sys.platform == "win32" else "prefork",

    # Timezone
    timezone="UTC",
    enable_utc=True,
)

# Tasks are imported via the 'include' argument in the Celery constructor
