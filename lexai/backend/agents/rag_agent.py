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
_SYS_START = "<|system|>"
_END       = "<|end|>"
_USR_START = "<|user|>"
_AST_START = "<|assistant|>"


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

    context = "\n\n---\n\n".join(
        "[Source {i}: {title} | {sec}]\n{text}".format(
            i=i+1,
            title=h.get("case_title") or h["case_id"],
            sec=h["section_hint"].upper(),
            text=h["text"],
        )
        for i, h in enumerate(hits)
    )

    prompt = (
        _SYS_START + "\n"
        "You are a precise Indian legal assistant. "
        "Answer ONLY from the provided excerpts. Cite [Source N]. "
        "If not found in excerpts, say so clearly."
        + _END + "\n"
        + _USR_START + f"\nQuestion: {query}\n\nExcerpts:\n{context}"
        + _END + "\n"
        + _AST_START + "\n"
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
