"""
GET /api/stream/{job_id}
Server-Sent Events endpoint.
Subscribes to Redis pub/sub channel pipeline:{job_id}.
Closes automatically on stage=complete or stage=error.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os

import redis.asyncio as aioredis
from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)
router = APIRouter()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")


@router.get("/stream/{job_id}")
async def stream_pipeline(job_id: str):
    async def event_generator():
        r = aioredis.from_url(REDIS_URL, decode_responses=True)
        pubsub = r.pubsub()
        await pubsub.subscribe(f"pipeline:{job_id}")

        try:
            # Wait up to 10 minutes for the pipeline to complete
            timeout = 600
            elapsed = 0

            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue

                data = message["data"]
                yield {"data": data}

                # Parse to check for terminal events
                try:
                    parsed = json.loads(data)
                    stage = parsed.get("stage")
                    status = parsed.get("status")
                    if stage == "complete" or (stage in ("complete", "extraction", "validation", "headnote", "indexing") and status == "failed"):
                        break
                except Exception:
                    pass

                elapsed += 0.1
                if elapsed >= timeout:
                    yield {"data": json.dumps({"stage": "complete", "status": "failed", "error": "Timeout"})}
                    break

        finally:
            await pubsub.unsubscribe(f"pipeline:{job_id}")
            await pubsub.close()
            await r.aclose()

    return EventSourceResponse(event_generator())
