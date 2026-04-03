"""
agents/rag_agent.py -- Robust RAG agent for LexAI.
Uses Qdrant for cross-case search and llama-cpp (via chatbot_agent) for generation.
"""
from __future__ import annotations
import asyncio
import logging
import time
from dataclasses import dataclass
from agents.chatbot_agent import get_llm, retrieve_top_k  # type: ignore
from services.qdrant_service import semantic_search as _qdrant_search, generate_embedding  # type: ignore
from services.neon import get_case_by_id  # type: ignore

logger = logging.getLogger(__name__)

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
    Retrieve relevant chunks (local or global), build prompt, and generate answer.
    """
    start = time.time()
    hits = []

    if case_id:
        # 1. Single-case RAG (Fast local search)
        logger.info("RAG | case-specific | case=%s", case_id)
        hits = await retrieve_top_k(query, case_id)
    else:
        # 2. Global RAG (Cross-case search)
        logger.info("RAG | global search | query='%s'", query[0:50])  # type: ignore
        try:
            # Embed the query string first (Required by qdrant_service)
            query_vector = await generate_embedding(query)
            # Find top relevant cases
            search_results = await _qdrant_search(query_vector=query_vector, top_k=3)
            
            # For each case, fetch top internal chunks
            for res in search_results:
                cid = res["caseId"]
                case_hits = await retrieve_top_k(query, cid)
                # Take top 2 chunks from each relevant case
                hits.extend(case_hits[0:2])  # type: ignore
            
            # Sort all retrieved chunks by score
            hits.sort(key=lambda x: x.get("score", 0), reverse=True)
            hits = hits[0:top_k]  # type: ignore
        except Exception as e:
            logger.error("Global RAG failed: %s", e)
            return RAGResult("Error performing global search.", [], query, int((time.time()-start)*1000))

    if not hits:
        return RAGResult(
            "No relevant information found in the judgments.",
            [], query, int((time.time() - start) * 1000)
        )

    # 3. Build Prompt (ChatML format for Qwen2.5)
    context = "\n\n".join(
        f"[Source {i+1}]: {h['section'].upper()}\n{h['excerpt']}"
        for i, h in enumerate(hits)
    )
    
    prompt = (
        "<|im_start|>system\nYou are LexAI, a precise Indian legal assistant. "
        "Answer the question using ONLY the provided excerpts. Cite [Source N].<|im_end|>\n"
        f"<|im_start|>user\nContext:\n{context}\n\nQuestion: {query}<|im_end|>\n"
        "<|im_start|>assistant\n"
    )

    # 4. Generate using the faster Llama-cpp model
    try:
        llm = await get_llm()
        # Non-streaming call for sync API
        response = await asyncio.to_thread(
            llm,
            prompt,
            max_tokens=512,
            temperature=0.1,
            stop=["<|im_end|>", "<|im_start|>"],
        )
        answer_text = response["choices"][0]["text"].strip()  # type: ignore
    except Exception as e:
        logger.error("LLM Generation failed: %s", e)
        answer_text = "Error generating answer from retrieved context."

    return RAGResult(
        answer=answer_text,
        sources=list(hits),  # type: ignore
        query=query,
        latency_ms=int((time.time() - start) * 1000),
    )

