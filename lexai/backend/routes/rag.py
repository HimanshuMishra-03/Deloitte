"""
routes/rag.py -- RAG + Voice query endpoints.

POST /api/rag/query       -- text query, returns grounded answer
POST /api/rag/voice/query -- audio upload, transcribes then answers
"""
from __future__ import annotations
import base64
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from agents.rag_agent import answer as rag_answer
from agents.voice_agent import transcribe, synthesize
from utils.json_utils import json_response

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
    fmt         = (audio.filename or "upload.webm").rsplit(".", 1)[-1]
    query_text  = await transcribe(audio_bytes, fmt=fmt)
    if not query_text:
        raise HTTPException(400, "Could not transcribe audio — check mic/format")
    result    = await rag_answer(query=query_text, case_id=case_id)
    audio_out = await synthesize(result.answer)
    return json_response({
        "transcribed_query": query_text,
        "answer":            result.answer,
        "audio_base64":      base64.b64encode(audio_out).decode(),
        "audio_format":      "wav",
        "latency_ms":        result.latency_ms,
    })
