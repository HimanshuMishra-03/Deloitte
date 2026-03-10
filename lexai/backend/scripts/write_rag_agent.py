"""
Write rag_agent.py and voice_agent.py with Phi-3 tokens that cannot be
passed through the tool XML parser directly.
"""
import pathlib

BACKEND = pathlib.Path(__file__).resolve().parent.parent

# Build Phi-3 tokens from parts so they don't trigger XML parsing
def tok(name):
    return f"<|{name}|>"

SYS  = tok("system")
END  = tok("end")
USR  = tok("user")
AST  = tok("assistant")

rag_content = f'''\
"""
agents/rag_agent.py -- Offline RAG agent for LexAI.

Uses Qdrant semantic search + local Phi-3-mini LLM for grounded answers.
Configure via .env:
  RAG_LLM_MODEL=microsoft/Phi-3-mini-4k-instruct
  TRANSFORMERS_OFFLINE=1
"""
from __future__ import annotations
import asyncio, logging, os, time
from dataclasses import dataclass
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline
from services.qdrant_service import semantic_search as _qdrant_search

logger    = logging.getLogger(__name__)
LLM_MODEL = os.getenv("RAG_LLM_MODEL", "microsoft/Phi-3-mini-4k-instruct")
_llm      = None
_llm_lock = asyncio.Lock()

# Phi-3 prompt template tokens
_SYS_START = "{SYS}"
_END       = "{END}"
_USR_START = "{USR}"
_AST_START = "{AST}"


async def _get_llm():
    global _llm
    async with _llm_lock:
        if _llm is None:
            logger.info("Loading LLM %s (first call ~30s on CPU)...", LLM_MODEL)
            device = "cuda" if torch.cuda.is_available() else "cpu"
            tok    = AutoTokenizer.from_pretrained(LLM_MODEL)
            model  = AutoModelForCausalLM.from_pretrained(
                LLM_MODEL,
                torch_dtype=torch.float16 if device == "cuda" else torch.float32,
                low_cpu_mem_usage=True,
            )
            _llm = pipeline(
                "text-generation", model=model, tokenizer=tok,
                max_new_tokens=512, temperature=0.1,
                do_sample=True, repetition_penalty=1.1,
            )
            logger.info("LLM loaded on %s", device)
    return _llm


@dataclass
class RAGResult:
    answer: str
    sources: list[dict]
    query: str
    latency_ms: int


async def answer(
    query: str,
    case_id: str | None = None,
    top_k: int = 5,
) -> RAGResult:
    """
    Retrieve chunks from Qdrant, build a grounded prompt, generate an answer.

    Args:
        query:   Natural-language legal question.
        case_id: If provided, restrict search to a single case.
        top_k:   Number of chunks to retrieve.
    """
    start = time.time()
    hits  = await _qdrant_search(query=query, limit=top_k, case_id=case_id)

    if not hits:
        return RAGResult(
            answer="No relevant information found in indexed judgments.",
            sources=[], query=query,
            latency_ms=int((time.time() - start) * 1000),
        )

    context = "\\n\\n---\\n\\n".join(
        "[Source {{i}}: {{title}} | {{sec}}]\\n{{text}}".format(
            i=i+1,
            title=h.get("case_title") or h["case_id"],
            sec=h["section_hint"].upper(),
            text=h["text"],
        )
        for i, h in enumerate(hits)
    )

    prompt = (
        _SYS_START + "\\n"
        "You are a precise Indian legal assistant. "
        "Answer ONLY from the provided excerpts. Cite [Source N]. "
        "If not found in excerpts, say so clearly."
        + _END + "\\n"
        + _USR_START + f"\\nQuestion: {{query}}\\n\\nExcerpts:\\n{{context}}"
        + _END + "\\n"
        + _AST_START + "\\n"
    )

    llm    = await _get_llm()
    output = await asyncio.to_thread(llm, prompt, return_full_text=False)
    text   = output[0]["generated_text"].strip()

    # Strip any trailing template tokens from generated text
    for sentinel in (_SYS_START, _END, _USR_START, _AST_START):
        if sentinel in text:
            text = text[:text.index(sentinel)].strip()

    return RAGResult(
        answer=text, sources=hits, query=query,
        latency_ms=int((time.time() - start) * 1000),
    )
'''

(BACKEND / "agents" / "rag_agent.py").write_text(rag_content, encoding="utf-8")
print("agents/rag_agent.py written OK")

voice_content = '''\
"""
agents/voice_agent.py -- Speech-to-Text (Whisper) + Text-to-Speech (Kokoro).

Configure via .env:
  WHISPER_MODEL=small
"""
from __future__ import annotations
import asyncio, io, logging, os, tempfile
import numpy as np
import soundfile as sf
import torch
import whisper
from pathlib import Path

logger         = logging.getLogger(__name__)
_WHISPER_SIZE  = os.getenv("WHISPER_MODEL", "small")
_whisper_model = None
_tts_pipeline  = None


def _get_whisper():
    global _whisper_model
    if _whisper_model is None:
        logger.info("Loading Whisper %s...", _WHISPER_SIZE)
        _whisper_model = whisper.load_model(_WHISPER_SIZE)
    return _whisper_model


def _get_tts():
    global _tts_pipeline
    if _tts_pipeline is None:
        logger.info("Loading Kokoro TTS...")
        from kokoro import KPipeline
        _tts_pipeline = KPipeline(lang_code="a")
    return _tts_pipeline


async def transcribe(audio_bytes: bytes, fmt: str = "webm") -> str:
    """
    Transcribe audio bytes to text using Whisper.

    Args:
        audio_bytes: Raw audio file bytes.
        fmt:         File extension / format hint (webm, mp3, wav, ogg).
    Returns:
        Transcribed text string.
    """
    with tempfile.NamedTemporaryFile(suffix=f".{fmt}", delete=False) as tmp:
        tmp.write(audio_bytes)
        path = tmp.name
    try:
        model  = _get_whisper()
        result = await asyncio.to_thread(
            model.transcribe, path,
            language="en", fp16=torch.cuda.is_available()
        )
        return result["text"].strip()
    finally:
        Path(path).unlink(missing_ok=True)


async def synthesize(text: str, voice: str = "af_heart") -> bytes:
    """
    Synthesize text to speech using Kokoro TTS.

    Args:
        text:  Input text (truncated to 300 words to keep latency reasonable).
        voice: Kokoro voice ID.
    Returns:
        WAV audio bytes.
    """
    words = text.split()
    if len(words) > 300:
        text = " ".join(words[:300]) + "..."

    tts    = _get_tts()
    chunks = []
    for _, _, audio in tts(text, voice=voice):
        if audio is not None:
            chunks.append(audio)

    if not chunks:
        return b""

    buf = io.BytesIO()
    sf.write(buf, np.concatenate(chunks), samplerate=24000, format="WAV")
    return buf.getvalue()
'''

(BACKEND / "agents" / "voice_agent.py").write_text(voice_content, encoding="utf-8")
print("agents/voice_agent.py written OK")

rag_route = '''\
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
'''

(BACKEND / "routes" / "rag.py").write_text(rag_route, encoding="utf-8")
print("routes/rag.py written OK")

scripts_dir = BACKEND / "scripts"
scripts_dir.mkdir(exist_ok=True)

dl_script = '''\
"""
scripts/download_models.py
Run ONCE to download all offline models (~3.4 GB total).
After running, set TRANSFORMERS_OFFLINE=1 in .env.
"""
import os
os.environ["TRANSFORMERS_OFFLINE"] = "0"

print("1/4  Downloading embedding model (all-mpnet-base-v2, ~420 MB)...")
from sentence_transformers import SentenceTransformer
SentenceTransformer("sentence-transformers/all-mpnet-base-v2")
print("     Done.")

print("2/4  Downloading Phi-3-mini-4k-instruct LLM (~2.2 GB)...")
from huggingface_hub import snapshot_download
snapshot_download("microsoft/Phi-3-mini-4k-instruct")
print("     Done.")

print("3/4  Downloading Whisper small STT (~461 MB)...")
import whisper
whisper.load_model("small")
print("     Done.")

print("4/4  Downloading Kokoro TTS (~330 MB)...")
from kokoro import KPipeline
KPipeline(lang_code="a")
print("     Done.")

print()
print("All models downloaded. Add these to backend/.env:")
print("  TRANSFORMERS_OFFLINE=1")
print("  HF_DATASETS_OFFLINE=1")
print("  RAG_LLM_MODEL=microsoft/Phi-3-mini-4k-instruct")
print("  WHISPER_MODEL=small")
'''

(scripts_dir / "download_models.py").write_text(dl_script, encoding="utf-8")
print("scripts/download_models.py written OK")

print("All files written successfully.")
