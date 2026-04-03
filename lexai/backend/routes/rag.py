"""
routes/rag.py -- RAG + Voice query endpoints.

POST /api/rag/query       -- text query, returns grounded answer
POST /api/rag/voice/query -- audio upload, transcribes then answers
"""
from __future__ import annotations
import asyncio
import base64
import json
import time
import logging
from fastapi import APIRouter, HTTPException, Query, UploadFile, File  # type: ignore
from fastapi.responses import StreamingResponse  # type: ignore
from pydantic import BaseModel  # type: ignore
from agents.rag_agent import answer as rag_answer  # type: ignore
from agents.voice_agent import transcribe, synthesize  # type: ignore
from agents.chatbot_agent import stream_answer  # type: ignore
from utils.json_utils import json_response  # type: ignore

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/rag", tags=["RAG"])


class QueryRequest(BaseModel):
    query: str
    case_id: str | None = None
    top_k: int = 5


@router.post("/query")
async def rag_query(req: QueryRequest):
    """Text-based RAG query against indexed legal judgments."""
    if not req.query.strip():
        raise HTTPException(400, "Query cannot be empty")
    result = await rag_answer(query=req.query, case_id=req.case_id, top_k=req.top_k)
    return json_response({
        "answer":     result.answer,
        "latency_ms": result.latency_ms,
        "sources": [
            {
                "case_title": s.get("case_title", ""),
                "excerpt":    s["text"][:300] + "...",
                "score":      round(s["score"], 4),
                "section":    s["section_hint"],
            }
            for s in result.sources
        ],
    })


@router.post("/voice/query")
async def voice_rag_query(
    audio: UploadFile = File(...),
    case_id: str | None = Query(default=None),
):
    """Voice query: upload audio, get transcription + answer + TTS audio back."""
    audio_bytes = await audio.read()
    filename    = audio.filename or "upload.webm"
    ext         = filename.rsplit(".", 1)[-1].lower()
    fmt = "webm" if ext in ("blob", "webm", "bin") else ext
    
    with open("debug_voice_query.log", "a", encoding="utf-8") as f:
        f.write(f"\n--- Voice Query {time.ctime()} ---\n")
        f.write(f"Size: {len(audio_bytes)} | Filename: {filename} | Format: {fmt}\n")
    
    try:
        query_text  = await transcribe(audio_bytes, fmt=fmt)
        with open("debug_voice_query.log", "a", encoding="utf-8") as f:
            f.write(f"Transcribed: '{query_text}'\n")
    except Exception as e:
        with open("debug_voice_query.log", "a", encoding="utf-8") as f:
            f.write(f"FAILED: {str(e)}\n")
        raise HTTPException(500, f"Transcription error: {str(e)}")

    if not query_text:
        with open("debug_voice_query.log", "a", encoding="utf-8") as f:
            f.write("WARNING: Empty transcription\n")
        raise HTTPException(400, "Could not transcribe audio — check mic/format")
    
    result    = await rag_answer(query=query_text, case_id=case_id)
    audio_out = await synthesize(result.answer)
    with open("debug_voice_query.log", "a", encoding="utf-8") as f:
        f.write(f"Answer: {len(result.answer)} chars | Audio: {len(audio_out)} bytes\n")
    return json_response({
        "transcribed_query": query_text,
        "answer":            result.answer,
        "audio_base64":      base64.b64encode(audio_out).decode(),  # type: ignore
        "audio_format":      "wav",
        "latency_ms":        result.latency_ms,
    })


# ── Chatbot streaming endpoint ─────────────────────────────────────────────────

class ChatRequest(BaseModel):
    question:     str
    case_id:      str | None    = None
    history:      list[dict]    = []
    page_context: str           = "dashboard"
    live_context: dict | None   = None

@router.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """
    Streaming chatbot endpoint — returns Server-Sent Events.
    Passes page_context and live_context to Lexi for intent routing.
    """
    if not req.question.strip():
        raise HTTPException(400, "Question cannot be empty")

    async def event_generator():
        full_answer = []
        try:
            async for token in stream_answer(
                question=req.question,
                case_id=req.case_id,
                history=req.history,
                page_context=req.page_context,
                live_context=req.live_context or {},
            ):
                full_answer.append(token)
                yield f"data: {json.dumps({'token': token})}\n\n"

            yield f"data: {json.dumps({'done': True, 'answer': ''.join(full_answer)})}\n\n"

        except Exception as e:
            logger.exception("Chat stream error")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
        },
    )


@router.post("/chat/sync")
async def chat_sync(req: ChatRequest):
    """Non-streaming chatbot — returns complete answer at once."""
    if not req.question.strip():
        raise HTTPException(400, "Question cannot be empty")

    tokens = []
    async for token in stream_answer(
        question=req.question,
        case_id=req.case_id,
        history=req.history,
        page_context=req.page_context,
        live_context=req.live_context or {},
    ):
        tokens.append(token)

    answer = "".join(tokens)

    return json_response({
        "answer":    answer,
        "case_id":   req.case_id,
        "question":  req.question,
    })


import os

@router.get("/chat/warmup")
async def warmup_chatbot():
    """Pre-load the chatbot model into RAM."""
    from agents.chatbot_agent import get_llm  # type: ignore
    await get_llm()
    return json_response({"status": "ready", "model": os.getenv("CHATBOT_MODEL_PATH")})


# ── Case Context Pre-loading ──────────────────────────────────────────────────

@router.post("/preload/{case_id}")
async def preload_case_context(case_id: str):
    """
    Called by frontend when a case page opens.
    Pre-loads all case chunks into memory cache.
    Runs asynchronously — frontend doesn't wait.
    """
    from services.case_cache import preload_case, is_warm

    if is_warm(case_id):
        return json_response({"status": "already_warm", "case_id": case_id})

    asyncio.create_task(preload_case(case_id))

    return json_response({
        "status":  "preloading",
        "case_id": case_id,
        "message": "Context loading in background.",
    })


@router.get("/preload/{case_id}/status")
async def preload_status(case_id: str):
    """Frontend polls this to know when context is ready."""
    from services.case_cache import is_warm, get_cached_chunks
    warm   = is_warm(case_id)
    chunks = get_cached_chunks(case_id)
    return json_response({
        "case_id": case_id,
        "warm":    warm,
        "chunks":  len(chunks) if chunks else 0,
    })


