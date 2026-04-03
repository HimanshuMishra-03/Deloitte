"""
services/case_cache.py
───────────────────────
In-memory LRU cache of pre-loaded case chunks.
When a case page opens, chunks are pre-fetched from NeonDB
and cached here. Chatbot queries search this cache first.

Capacity: last 10 cases (LRU eviction)
Reset: on server restart (acceptable — cases re-warm on next open)
"""
from __future__ import annotations

import logging
import time
from collections import OrderedDict
from typing import Any

logger = logging.getLogger(__name__)

# LRU cache: case_id → {"chunks": [...], "loaded_at": float}
_CACHE: OrderedDict[str, dict[str, Any]] = OrderedDict()
_MAX_CASES = 10
_CACHE_TTL = 3600  # 1 hour


def get_cached_chunks(case_id: str) -> list[dict] | None:
    """Return cached chunks for case_id if still warm."""
    if case_id not in _CACHE:
        return None
    entry = _CACHE[case_id]
    if time.time() - entry["loaded_at"] > _CACHE_TTL:
        del _CACHE[case_id]
        return None
    _CACHE.move_to_end(case_id)
    return entry["chunks"]


def set_cached_chunks(case_id: str, chunks: list[dict]) -> None:
    """Store chunks for case_id. Evicts oldest if over capacity."""
    _CACHE[case_id] = {"chunks": chunks, "loaded_at": time.time()}
    _CACHE.move_to_end(case_id)
    while len(_CACHE) > _MAX_CASES:
        evicted = next(iter(_CACHE))
        del _CACHE[evicted]
        logger.debug("Evicted case %s from context cache", evicted[:8])


def is_warm(case_id: str) -> bool:
    return get_cached_chunks(case_id) is not None


async def preload_case(case_id: str) -> int:
    """
    Pre-fetch all structured sections for a case from NeonDB and cache them.
    Returns number of chunks loaded.
    """
    if is_warm(case_id):
        cached = get_cached_chunks(case_id)
        n = len(cached) if cached else 0
        logger.info("Case %s already warm (%d chunks)", case_id[:8], n)
        return n

    logger.info("Pre-loading case %s into context cache...", case_id[:8])
    start = time.time()

    try:
        from services.neon import get_case_by_id  # type: ignore

        case_data = await get_case_by_id(case_id)
        if not case_data:
            logger.warning("No data found for case %s", case_id[:8])
            return 0

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

        set_cached_chunks(case_id, chunks)
        logger.info(
            "Case %s pre-loaded: %d chunks in %.0fms",
            case_id[:8], len(chunks), (time.time() - start) * 1000,
        )
        return len(chunks)

    except Exception as e:
        logger.error("Failed to preload case %s: %s", case_id[:8], e)
        return 0
