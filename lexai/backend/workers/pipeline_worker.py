"""
workers/pipeline_worker.py — Celery task for the 4-agent LexAI pipeline.
"""
from __future__ import annotations

import asyncio
import logging
import sys

from celery.utils.log import get_task_logger

from celery_app import celery_app
from agents.orchestrator import run_pipeline
from services.file_parser import parse_file
from services.gemini import BudgetExhaustedError
from services import neon

logger = get_task_logger(__name__)


def _run_async(coro):
    """
    Run an async coroutine from a sync Celery task.
    Creates a fresh isolated event loop per task — Windows + Linux safe.
    """
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        try:
            pending = asyncio.all_tasks(loop)
            if pending:
                loop.run_until_complete(
                    asyncio.gather(*pending, return_exceptions=True)
                )
        finally:
            try:
                loop.run_until_complete(neon.close_pool())
            except Exception:
                pass
            loop.close()
            asyncio.set_event_loop(None)


@celery_app.task(
    bind=True,
    name="workers.pipeline_worker.run_pipeline_task",
    queue="pipeline",
    max_retries=1,
    acks_late=True,
)
def run_pipeline_task(
    self,
    job_id: str,
    raw_text: str,
    file_name: str,
):
    """
    Execute the 4-agent pipeline for a legal judgment.
    raw_text is already parsed text (not bytes) — parsing happens in upload.py.
    
    RPD cost: 3 calls per document (extraction + validation + headnote).
    Optional 4th call if flagged fields need correction.
    """
    logger.info("Pipeline start | job=%s | file=%s | chars=%d",
                job_id, file_name, len(raw_text))

    try:
        case_id = _run_async(run_pipeline(job_id, raw_text, file_name))
        logger.info("Pipeline complete | job=%s | case=%s", job_id, case_id)
        return {"status": "complete", "caseId": case_id, "jobId": job_id}

    except BudgetExhaustedError as exc:
        logger.error("Budget exhausted | job=%s: %s", job_id, exc)
        return {"status": "failed", "error": str(exc), "jobId": job_id}

    except Exception as exc:
        logger.error("Pipeline failed | job=%s: %s", job_id, exc, exc_info=True)
        raise self.retry(exc=exc, countdown=30) from exc