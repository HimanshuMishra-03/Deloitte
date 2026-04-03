"""
Qdrant vector service — single embedding model for ALL operations.

Model: all-MiniLM-L6-v2 (384-dim, ~40ms/query, loaded via SentenceTransformer)
Loader: SentenceTransformer() — never BertModel.from_pretrained()

Functions:
  embed(text) → list[float]          -- used for indexing AND querying
  semantic_search(query, ...) → hits -- embeds query internally
  upsert_point(case_id, vec, pl)     -- stores a single point
  generate_embedding(text)           -- alias for embed() (backwards compat)
  init_qdrant()                      -- creates collection if needed
"""
from __future__ import annotations

import asyncio
import logging
import os
import threading
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
EMBED_MODEL = os.getenv("EMBED_MODEL", "all-MiniLM-L6-v2")
EMBED_DIM   = int(os.getenv("EMBED_DIM", "384"))
COLLECTION  = os.getenv("QDRANT_COLLECTION", "lexai_cases")

_client:     Any = None
_model:      Any = None
_model_lock       = threading.Lock()


# ── Single global embedding model ─────────────────────────────────────────────

def _get_embed_model():
    """Load and cache the SentenceTransformer model (thread-safe)."""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from sentence_transformers import SentenceTransformer
                logger.info("Loading embedding model: %s", EMBED_MODEL)
                _model = SentenceTransformer(EMBED_MODEL, device="cpu")
                logger.info("Embedding model loaded ✓  dim=%d", EMBED_DIM)
    return _model


def _embed_sync(text: str) -> list[float]:
    """Embed a single string synchronously. Used for both indexing and querying."""
    model = _get_embed_model()
    vec = model.encode(
        text[:8000],  # truncate to stay within token limit
        show_progress_bar=False,
        normalize_embeddings=True,
    )
    return vec.tolist()


async def embed(text: str) -> list[float]:
    """Async wrapper for embedding. Same model for indexing + search + chatbot."""
    return await asyncio.to_thread(_embed_sync, text)


# Backwards compat alias — called by search_index_agent and rag_agent
generate_embedding = embed


# ── Qdrant client ──────────────────────────────────────────────────────────────

def _get_client():
    global _client
    if _client is None:
        from qdrant_client import QdrantClient
        url = os.environ["QDRANT_URL"]
        api_key = os.getenv("QDRANT_API_KEY")
        _client = QdrantClient(url=url, api_key=api_key, timeout=30)
    return _client


# ── Init ───────────────────────────────────────────────────────────────────────

async def init_qdrant() -> None:
    """Create collection with correct 384-dim vectors if needed."""
    from qdrant_client.models import (
        Distance, PayloadSchemaType, VectorParams,
    )

    client = _get_client()
    collections = await asyncio.to_thread(client.get_collections)
    existing = {c.name for c in collections.collections}

    if COLLECTION not in existing:
        await asyncio.to_thread(
            client.create_collection,
            COLLECTION,
            vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
        )
        logger.info("Qdrant collection '%s' created (dim=%d) ✓", COLLECTION, EMBED_DIM)

        for field in ["outcome", "practiceArea", "judgmentType"]:
            await asyncio.to_thread(
                client.create_payload_index,
                COLLECTION,
                field_name=field,
                field_schema=PayloadSchemaType.KEYWORD,
            )
        logger.info("Qdrant payload indexes created ✓")
    else:
        logger.info("Qdrant collection '%s' already exists ✓", COLLECTION)


# ── Upsert ─────────────────────────────────────────────────────────────────────

async def upsert_point(case_id: str, vector: list[float], payload: dict[str, Any]) -> None:
    from qdrant_client.models import PointStruct
    client = _get_client()
    point = PointStruct(id=case_id, vector=vector, payload=payload)
    await asyncio.to_thread(client.upsert, COLLECTION, points=[point], wait=True)
    logger.info("Qdrant upsert '%s' ✓", case_id)


# ── Semantic search ────────────────────────────────────────────────────────────

async def semantic_search(
    query_vector: list[float],
    top_k: int = 15,
    outcome: Optional[str] = None,
    practice_area: Optional[str] = None,
    section_of_law: Optional[str] = None,
) -> list[dict]:
    """Search Qdrant with a pre-computed query vector."""
    from qdrant_client.models import FieldCondition, Filter, MatchValue

    client = _get_client()

    must: list[FieldCondition] = []
    if outcome:
        must.append(FieldCondition(key="outcome", match=MatchValue(value=outcome)))
    if practice_area:
        must.append(FieldCondition(key="practiceArea", match=MatchValue(value=practice_area)))
    if section_of_law:
        must.append(FieldCondition(key="sectionsOfLaw", match=MatchValue(value=section_of_law)))

    qdrant_filter = Filter(must=must) if must else None

    results = await asyncio.to_thread(
        client.query_points,
        collection_name=COLLECTION,
        query=query_vector,
        limit=top_k,
        query_filter=qdrant_filter,
        with_payload=True,
        score_threshold=0.35,
    )

    return [
        {"caseId": str(r.id), "score": r.score, "payload": r.payload or {}}
        for r in results.points
    ]


# ── Get all case chunks (for preloading) ───────────────────────────────────────

async def get_all_case_chunks(case_id: str, limit: int = 40) -> list[dict]:
    """Fetch all chunks for a case from Qdrant (for context pre-loading)."""
    from qdrant_client.models import FieldCondition, Filter, MatchValue

    client = _get_client()

    records = await asyncio.to_thread(
        lambda: client.scroll(
            collection_name=COLLECTION,
            scroll_filter=Filter(must=[
                FieldCondition(key="case_id", match=MatchValue(value=case_id))
            ]),
            limit=limit,
            with_payload=True,
            with_vectors=False,
        )[0]
    )

    return [
        {
            "text":         r.payload.get("text", ""),
            "section_hint": r.payload.get("section_hint", ""),
            "chunk_index":  r.payload.get("chunk_index", 0),
        }
        for r in records
    ]
