"""
POST /api/upload
Accepts PDF or DOCX, parses to text, enqueues Celery pipeline task.
Returns {jobId} immediately (async, SSE at /api/stream/{jobId}).
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, UploadFile

from services.file_parser import parse_file
from utils.json_utils import json_response
from workers.pipeline_worker import run_pipeline_task

router = APIRouter()

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
}
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB


@router.post("/upload")
async def upload_file(file: UploadFile):
    """
    Upload a legal judgment PDF or DOCX.
    Parsing happens here (sync, before Celery) so the task only receives clean text.
    """
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {file.content_type}. Upload PDF or DOCX only.",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB limit.")

    # Parse to text before enqueuing — keeps the Celery task lightweight
    try:
        raw_text = parse_file(file_bytes, file.content_type)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse file: {e}")

    if len(raw_text.strip()) < 200:
        raise HTTPException(
            status_code=422, detail="Document appears to be empty or unreadable."
        )

    # Enqueue the pipeline task (text only, not bytes — saves Redis memory)
    job_id = str(uuid.uuid4())
    run_pipeline_task.apply_async(
        args=[job_id, raw_text, file.filename or "upload.pdf"],
        task_id=job_id,
    )

    return json_response({"jobId": job_id, "fileName": file.filename})
