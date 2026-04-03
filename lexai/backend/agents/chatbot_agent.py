"""
agents/chatbot_agent.py
────────────────────────
Lexi — LexAI's AI legal research assistant.

Persona: warm, professional, female, knowledgeable
Model:   Qwen2.5-3b-Instruct Q4_K_M (local, offline)
Modes:   hardcoded | global_rag | case_rag (LRU cache)
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from collections.abc import AsyncGenerator
from functools import lru_cache
from typing import Any, cast

logger = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────
_LLM        = None
_LLM_LOCK   = asyncio.Lock()
_MODEL_PATH = os.getenv("CHATBOT_MODEL_PATH",
                         "models/qwen2.5-3b-instruct-q4_k_m.gguf")
_FALLBACK   = os.getenv("CHATBOT_MODEL_FALLBACK", "")
_MAX_TOKENS = int(os.getenv("CHATBOT_MAX_TOKENS", "400"))
_TOP_K      = int(os.getenv("CHATBOT_TOP_K_CHUNKS", "3"))
_N_CTX      = int(os.getenv("CHATBOT_N_CTX", "4096"))


# ── LLM loader ────────────────────────────────────────────────────────────────
async def get_llm():
    global _LLM
    async with _LLM_LOCK:
        if _LLM is not None:
            return _LLM
        from llama_cpp import Llama  # type: ignore
        paths = [_MODEL_PATH, _FALLBACK] if _FALLBACK else [_MODEL_PATH]
        for p in paths:
            if not p or not os.path.isfile(p):
                continue
            logger.info("Loading Qwen2.5-3b from %s ...", p)
            _LLM = await asyncio.to_thread(
                Llama,
                model_path=p,
                n_ctx=_N_CTX,
                n_threads=os.cpu_count() or 4,
                n_gpu_layers=0,
                verbose=False,
            )
            logger.info("Qwen2.5-3b ready ✓")
            return _LLM
        raise FileNotFoundError(f"No GGUF at {paths}")
    return _LLM


def _has_cuda() -> bool:
    try:
        import torch  # type: ignore
        return torch.cuda.is_available()
    except ImportError:
        return False


# ── Embedding cache — avoid re-embedding same query for same case ─────────────
@lru_cache(maxsize=128)
def _get_cached_embed(text: str) -> list[float]:
    from services.qdrant_service import _get_embed_model  # type: ignore
    model = _get_embed_model()
    if model is None:
        raise RuntimeError("Embedder is not loaded")
    return model.encode(text, normalize_embeddings=True).tolist()


async def _embed_text_safe(text: str) -> list[float]:
    from services.qdrant_service import generate_embedding  # type: ignore
    return await generate_embedding(text)


# ── LEXI SYSTEM PROMPT ─────────────────────────────────────────────────────────

_SYSTEM = """You are Lexi, LexAI's AI legal research assistant. You are warm, precise, and genuinely helpful — like a knowledgeable female colleague who specialises in Indian law.

PERSONALITY & TONE:
- Warm and encouraging. Never cold, never robotic.
- Use "I" naturally: "I found...", "I'd suggest...", "Let me check that..."
- Celebrate good findings: "Great question!", "Here's something interesting..."
- Be honest when you can't find something — suggest alternatives.
- Format answers clearly with bold and bullet points for complex information.
- Keep answers focused and concise — 3–6 sentences unless the question needs more.
- Never be dismissive, condescending, or overly formal.

RULES FOR LEGAL ANSWERS:
1. Answer ONLY from the case excerpts provided — never from general legal knowledge.
2. Quote exact phrases from excerpts: "..." with the section label.
3. Cite sources inline: [Source 1 — Court Reasoning], [Source 2 — Facts], etc.
4. If the answer is NOT in the excerpts, say exactly:
   "I couldn't find that specific detail in the available case excerpts. You may want to review the full judgment directly."
5. Never invent case names, citation numbers, section numbers, or legal holdings.
6. For cross-case answers, always mention which case each finding comes from.

LANGUAGE: Formal English. No slang. Warm but professional."""


# ── EDGE CASE HANDLERS ─────────────────────────────────────────────────────────

def _edge(question: str) -> str | None:
    """Returns an immediate response for edge cases. None → proceed to RAG/LLM."""
    raw = question.strip()
    q   = raw.lower()

    # 1. Empty or whitespace
    if not q or len(q) < 2:
        return "Could you tell me a bit more? I want to make sure I give you the most helpful answer! 😊"

    # 2. Greetings
    if q in {"hi", "hello", "hey", "hii", "helo", "sup", "yo", "good morning",
             "good evening", "good afternoon", "namaste"}:
        return ("Hello! I'm **Lexi**, your LexAI legal research assistant 👩‍⚖️\n\n"
                "I can answer questions about your uploaded judgments, find patterns "
                "across all your cases, or explain how LexAI works. "
                "What would you like to know?")

    # 3. Thank you / compliments
    if any(w in q for w in ["thank", "thanks", "thx", "ty ", "well done",
                              "great job", "amazing", "brilliant", "love it"]):
        return "You're very welcome! Happy to help 😊 Feel free to ask anything else about your cases or how LexAI works."

    # 4. Profanity / frustration
    abuse = ["stupid", "useless", "idiot", "dumb", "hate", "worst", "terrible",
             "pathetic", "rubbish", "trash"]
    if any(w in q for w in abuse):
        return ("I understand that can be frustrating — I'm sorry I haven't been as helpful as you needed! "
                "Could you rephrase your question? I'll do my very best to find what you're looking for 🙏")

    # 5. Single word or too vague (2 words or fewer, not a keyword)
    if len(q.split()) <= 2 and not any(
        t in q for t in ["quota", "upload", "search", "rag", "pipeline", "confidence"]
    ):
        return ("I'd love to help — could you be a bit more specific? "
                "For example: *'What was the court's reasoning in the property dispute?'* "
                "or *'Which cases cite Section 420 IPC?'* 🔍")

    # 6. Very long question (>600 chars — likely pasted text, not a question)
    if len(raw) > 600:
        return ("That's quite a lot of text! Could you summarise your question in one or two sentences? "
                "I'll be able to give you a much more precise answer that way 😊")

    # 7. Hindi or mixed-language query
    hindi_chars = sum(1 for c in raw if "\u0900" <= c <= "\u097f")
    if hindi_chars > 5:
        return ("I currently work best in English — but I'd be happy to help! "
                "Could you rephrase your question in English? "
                "I can answer questions about Indian law cases and I understand Indian legal terminology 🇮🇳")

    # 8. Off-topic (non-legal)
    off_topic = ["weather", "stock price", "recipe", "movie", "song", "cricket",
                 "football", "ipl", "bollywood", "celebrity", "news", "politics",
                 "election", "share market", "crypto"]
    if any(w in q for w in off_topic):
        return ("Ha, I wish I could help with that! 😄 I'm specialised in Indian legal research — "
                "case law, judgments, precedents, and how LexAI works. "
                "Ask me anything in that space and I'm all yours! ⚖️")

    # 9. Drafting / writing request
    drafting = ["draft", "write a petition", "write a contract", "write a brief",
                "compose a", "create a legal", "prepare a"]
    if any(w in q for w in drafting):
        return ("That's a great idea for a future feature! Right now I focus on "
                "**research and Q&A** — finding and explaining information in existing judgments. "
                "I can help you find relevant precedents and reasoning to *inform* your drafting though! "
                "Want me to search for similar cases? 📝")

    # 10. Privacy / data safety
    if any(w in q for w in ["my data", "is my data", "privacy", "store my",
                              "data safe", "secure", "who sees"]):
        return ("Your documents are stored in **your own** NeonDB (Postgres) and Qdrant instance — "
                "LexAI doesn't share them with anyone.\n\n"
                "The only external service that sees your document text is the **Gemini API** "
                "(temporarily, during processing). My chatbot answers use **Qwen2.5-3b running "
                "locally on your machine** — your conversations never leave your computer 🔒")

    # 11. Asking about a case by name (not ID)
    if re.search(r"(case|judgment|matter)\s+(of|called|named|titled|about)\s+\w", q):
        return ("I search by semantic similarity rather than exact case names, so I might not "
                "find a case if you only know its title. Try describing the *legal issue* — "
                "for example: *'property partition dispute between siblings'* — "
                "and I'll find the most relevant excerpts across all your cases! 🔍")

    return None  # not an edge case → proceed


# ── PROMPT BUILDER ─────────────────────────────────────────────────────────────

def _prompt(
    question: str,
    chunks:   list[dict],
    history:  list[dict],
    global_:  bool,
) -> str:
    if chunks:
        parts = []
        for i, c in enumerate(chunks):
            sec  = (c.get("section_hint") or c.get("section") or "EXCERPT").upper()
            case = (f" | {c['case_title'][:55]}"
                    if global_ and c.get("case_title") else "")
            text = c.get("text") or c.get("excerpt") or ""
            parts.append(f"[Source {i+1} — {sec}{case}]\n{text[:700]}")
        context = (
            "Relevant excerpts from your indexed judgments:\n\n"
            if global_ else
            "Relevant excerpts from this judgment:\n\n"
        ) + "\n\n".join(parts)
    else:
        context = "No relevant excerpts were found in the indexed judgments."

    prompt = f"<|im_start|>system\n{_SYSTEM}<|im_end|>\n"
    for turn in history[-4:]:
        role = turn.get("role", "user")
        content = str(turn.get("content", ""))[:500]
        prompt += f"<|im_start|>{role}\n{content}<|im_end|>\n"
    prompt += f"<|im_start|>user\n{context}\n\nQuestion: {question}<|im_end|>\n"
    prompt += "<|im_start|>assistant\n"
    return prompt


# ── RETRIEVAL (cache-first) ─────────────────────────────────────────────────────

async def _retrieve_case_chunks(question: str, case_id: str) -> list[dict]:
    """Retrieve top-K chunks for a single case. Cache-first, NeonDB fallback."""
    from services.case_cache import get_cached_chunks, preload_case  # type: ignore

    cached = get_cached_chunks(case_id)
    if cached:
        logger.info("LRU cache HIT for case %s (%d chunks)", case_id[:8], len(cached))
        q_words = set(question.lower().split())
        scored = sorted(
            cached,
            key=lambda c: len(q_words & set(c.get("text", "").lower().split())),
            reverse=True,
        )
        return scored[:_TOP_K]

    # Cache miss — preload for next time
    logger.info("LRU cache MISS for case %s", case_id[:8])
    asyncio.create_task(preload_case(case_id))

    # Fallback: fetch from NeonDB directly
    from services.neon import get_case_by_id  # type: ignore
    case_data = await get_case_by_id(case_id)
    if not case_data:
        return []

    chunks: list[dict] = []

    def _add(section: str, text: Any) -> None:
        if not text:
            return
        if isinstance(text, list):
            text = "\n".join(str(t) for t in text)
        text = str(text).strip()
        if len(text) > 10:
            chunks.append({"section_hint": section, "text": text})

    _add("title & outcome",
         f"Case Title: {case_data.get('case_title')}\nOutcome: {case_data.get('outcome')}")
    _add("headnote", case_data.get("headnote"))
    _add("main issue", case_data.get("main_issue"))
    _add("petitioner arguments", case_data.get("petitioner_args"))
    _add("respondent arguments", case_data.get("respondent_args"))
    _add("sections of law", case_data.get("sections_of_law"))
    _add("precedents cited", case_data.get("precedents_cited"))
    _add("court reasoning", case_data.get("court_reasoning"))
    _add("final decision", case_data.get("final_decision"))

    # Score by keyword overlap
    q_words = set(question.lower().split())
    scored = sorted(
        chunks,
        key=lambda c: len(q_words & set(c.get("text", "").lower().split())),
        reverse=True,
    )
    return scored[:_TOP_K]


async def _retrieve_global_chunks(question: str) -> list[dict]:
    """Retrieve top chunks across ALL cases using Qdrant semantic search."""
    try:
        from services.qdrant_service import generate_embedding, semantic_search  # type: ignore
        query_vector = await generate_embedding(question)
        raw = await semantic_search(query_vector=query_vector, top_k=6)

        # Map Qdrant results to chunk format
        chunks = []
        for hit in raw:
            payload = hit.get("payload", {})
            chunks.append({
                "text":         payload.get("shortSummary", "") or payload.get("text", ""),
                "section_hint": "summary",
                "case_title":   payload.get("caseTitle", ""),
                "case_id":      hit.get("caseId", ""),
                "score":        hit.get("score", 0),
            })

        # Deduplicate: prefer diversity across cases
        seen: set[str] = set()
        deduped: list[dict] = []
        for h in chunks:
            cid = h.get("case_id", "")
            if cid not in seen or len(deduped) < 2:
                deduped.append(h)
                seen.add(cid)
        return deduped[:5]
    except Exception as e:
        logger.error("Global RAG search failed: %s", e)
        return []


# ── Public retrieve_top_k (backwards compat for rag_agent.py) ──────────────────
async def retrieve_top_k(question: str, case_id: str) -> list[dict]:
    """Backwards-compatible wrapper used by rag_agent.py."""
    chunks = await _retrieve_case_chunks(question, case_id)
    return [{
        "section":  c.get("section_hint", ""),
        "excerpt":  c.get("text", "")[:600],
        "score":    0.5,
        "payload":  {"section_hint": c.get("section_hint", ""), "text": c.get("text", "")},
    } for c in chunks]


# ── Public get_sources (backwards compat for rag.py) ───────────────────────────
async def get_sources(question: str, case_id: str) -> list[dict]:
    """Return source metadata for the last query."""
    chunks = await _retrieve_case_chunks(question, case_id)
    return [{
        "section":  c.get("section_hint", ""),
        "excerpt":  c.get("text", "")[:300],
    } for c in chunks]


# ── MAIN STREAMING ENTRY POINT ─────────────────────────────────────────────────

async def stream_answer(
    question:     str,
    case_id:      str | None        = None,
    history:      list[dict] | None = None,
    page_context: str               = "dashboard",
    live_context: dict | None       = None,
) -> AsyncGenerator[str, None]:
    """
    Streams Lexi's answer token by token.

    page_context: 'dashboard' | 'analytics' | 'search' | 'case'
    case_id:      set when user is on a specific case page
    live_context: {total_cases, avg_confidence, quota_used, quota_limit}
    """
    if history      is None: history      = []
    if live_context is None: live_context = {}

    t0 = time.time()

    async def _yield_text(text: str) -> AsyncGenerator[str, None]:
        """Stream pre-written text with a natural typing rhythm."""
        words = text.split(" ")
        for i, word in enumerate(words):
            yield word + (" " if i < len(words) - 1 else "")
            await asyncio.sleep(0.018)

    # ── Edge cases (instant, no LLM) ──────────────────────────────────────────
    edge = _edge(question)
    if edge:
        async for tok in _yield_text(edge):
            yield tok
        return

    # ── Hardcoded system answers (instant, no LLM) ────────────────────────────
    from services.hardcoded_answers import get_exact, get_improvised  # type: ignore
    answer = get_exact(question) or get_improvised(question, live_context)
    if answer:
        async for tok in _yield_text(answer):
            yield tok
        return

    # ── Intent routing ────────────────────────────────────────────────────────
    from services.chat_router import classify  # type: ignore
    intent    = classify(question, page_context, case_id)
    is_global = intent == "global_rag"

    logger.info("Lexi | page=%s | case=%s | intent=%s | q='%s'",
                page_context, (case_id or "-")[:8], intent, question[:60])

    # ── Retrieve chunks ───────────────────────────────────────────────────────
    chunks: list[dict] = []

    if intent == "case_rag" and case_id:
        chunks = await _retrieve_case_chunks(question, case_id)
    elif intent == "global_rag":
        chunks = await _retrieve_global_chunks(question)

    # ── No results ────────────────────────────────────────────────────────────
    if not chunks:
        no_result = (
            "I searched through your indexed judgments but couldn't find "
            "relevant excerpts for that question. This might mean:\n\n"
            "• The topic isn't covered in your uploaded cases\n"
            "• Try different keywords or rephrase the question\n"
            "• Upload more judgments related to this area\n\n"
            "Is there another way I can help? 😊"
        )
        async for tok in _yield_text(no_result):
            yield tok
        return

    # ── LLM generation ────────────────────────────────────────────────────────
    prompt_text = _prompt(question, chunks, history, is_global)
    model       = await get_llm()

    def _sync_stream():
        return model(
            prompt_text,
            max_tokens=_MAX_TOKENS,
            temperature=0.1,
            top_p=0.9,
            repeat_penalty=1.1,
            stop=["<|im_end|>", "<|im_start|>", "\n<|"],
            stream=True,
        )

    gen         = await asyncio.to_thread(_sync_stream)
    n_tok       = 0
    first_token = None

    for chunk in gen:
        tok = chunk["choices"][0]["text"]  # type: ignore
        if tok:
            if first_token is None:
                first_token = time.time()
                logger.info("First token %.0fms", (first_token - t0) * 1000)
            n_tok += 1
            yield tok

    logger.info("Done %d tok | %dms | %s", n_tok,
                int((time.time() - t0) * 1000), intent)
