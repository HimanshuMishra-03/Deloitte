"""
Master Orchestrator — optimized for 20 RPD constraint.
Sequences agents and manages selective corrections based on daily budget.
"""
from __future__ import annotations

import logging
import os
import uuid

import redis as sync_redis

from agents import extraction_agent, headnote_agent, search_index_agent, validation_agent
from models.schemas import PipelineEvent
from services.gemini import _budget_tracker, DAILY_BUDGET, budget_status

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# Sync Redis client for publishing
_redis_client: sync_redis.Redis | None = None

def _get_redis() -> sync_redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = sync_redis.from_url(REDIS_URL, decode_responses=True)
    return _redis_client

def _publish(job_id: str, event: PipelineEvent) -> None:
    try:
        _get_redis().publish(f"pipeline:{job_id}", event.model_dump_json())
    except Exception as e:
        logger.warning("SSE publish failed: %s", e)

async def run_pipeline(job_id: str, raw_text: str, file_name: str) -> str:
    """
    Full 4-agent pipeline optimized for < 5 RPD per document.
    """
    case_id = str(uuid.uuid4())

    try:
        # ── CALL 1: Extraction ─────────────────────────────────────────────
        _publish(job_id, PipelineEvent(stage="extraction", status="running", message="Extracting fields in single call..."))
        extraction = await extraction_agent.run(raw_text)
        _publish(job_id, PipelineEvent(stage="extraction", status="done", preview={"caseTitle": extraction.caseTitle}))

        # ── CALL 2: Batch Validation ───────────────────────────────────────
        _publish(job_id, PipelineEvent(stage="validation", status="running", message="Batch-grounding fields..."))
        validation = await validation_agent.run(case_id, extraction, raw_text)
        
        # ── CALL 3 (conditional): Targeted re-extraction ────────────────────
        if validation.flaggedFields:
            used = _budget_tracker.used_today
            if used < DAILY_BUDGET:
                _publish(job_id, PipelineEvent(
                    stage="validation", status="retrying",
                    message=f"Re-extracting {len(validation.flaggedFields)} flagged field(s)..."
                ))

                correction_hints = {
                    name: {
                        "currentValue":  getattr(extraction, name),
                        "problem":       validation.fields[name].flagReason,
                        "sourceEvidence": validation.fields[name].sourceSpan,
                    }
                    for name in validation.flaggedFields
                    if name in validation.fields
                }

                retry_result = await extraction_agent.run_with_corrections(
                    raw_text=raw_text,
                    fields_to_fix=validation.flaggedFields,
                    correction_hints=correction_hints,
                )
                
                # Merge corrected fields back
                for field in validation.flaggedFields:
                    if field in retry_result:
                        setattr(extraction, field, retry_result[field])
                
                # We don't re-validate to save RPD. The headnote call uses these new values.
                _publish(job_id, PipelineEvent(stage="validation", status="done", message="Corrections applied."))
            else:
                logger.warning("Budget too low to retry flagged fields. Publishing as is.")
                _publish(job_id, PipelineEvent(stage="validation", status="done", message="Budget low; skipping retries."))
        else:
            _publish(job_id, PipelineEvent(stage="validation", status="done", preview={"overallConfidence": validation.overallConfidence}))

        # ── CALL 3 or 4: Headnote ─────────────────────────────────────────
        _publish(job_id, PipelineEvent(stage="headnote", status="running", message="Generating SCC headnote from validated data..."))
        headnote = await headnote_agent.run(extraction)
        _publish(job_id, PipelineEvent(stage="headnote", status="done"))

        # ── CALL 0 (free): Indexing ────────────────────────────────────────
        _publish(job_id, PipelineEvent(stage="indexing", status="running", message="Finalizing search index..."))
        await search_index_agent.run(case_id, file_name, extraction, validation, headnote)
        _publish(job_id, PipelineEvent(stage="indexing", status="done"))

        # ── COMPLETE ──────────────────────────────────────────────────────────
        _publish(job_id, PipelineEvent(stage="complete", status="done", caseId=case_id))
        return case_id

    except Exception as e:
        logger.exception("Pipeline failed: job=%s", job_id)
        _publish(job_id, PipelineEvent(stage="complete", status="failed", error=str(e)))
        raise
