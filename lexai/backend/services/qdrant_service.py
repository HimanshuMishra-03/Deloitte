"""
Qdrant vector service with sentence-transformers embeddings and filtered semantic search.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Optional

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PayloadSchemaType,
    PointStruct,
    VectorParams,
)

logger = logging.getLogger(__name__)

COLLECTION = "lexai_cases"
VECTOR_DIM = 384  # all-MiniLM-L6-v2

_client: QdrantClient | None = None
_embedder: Any = None


def _get_client() -> QdrantClient:
    global _client
    if _client is None:
        url = os.environ["QDRANT_URL"]
        api_key = os.getenv("QDRANT_API_KEY")  # None for local Docker = no auth
        _client = QdrantClient(url=url, api_key=api_key, timeout=30)
    return _client


async def _get_embedder():
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer
        # Downloads ~22 MB on first run, then cached locally
        _embedder = await asyncio.to_thread(SentenceTransformer, "all-MiniLM-L6-v2")
    return _embedder


# ── INIT ──────────────────────────────────────────────────────────────────────

async def init_qdrant() -> None:
    client = _get_client()
    collections = await asyncio.to_thread(client.get_collections)
    existing = {c.name for c in collections.collections}

    if COLLECTION not in existing:
        await asyncio.to_thread(
            client.create_collection,
            COLLECTION,
            vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
        )
        logger.info("Qdrant collection '%s' created ✓", COLLECTION)

        # Payload indexes required for fast filtered search
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


# ── EMBEDDING ─────────────────────────────────────────────────────────────────

async def generate_embedding(text: str) -> list[float]:
    embedder = await _get_embedder()
    # Truncate to ~8k chars to keep within model token limit
    truncated = text[:8000]
    embedding = await asyncio.to_thread(
        embedder.encode, truncated, normalize_embeddings=True
    )
    return embedding.tolist()


# ── UPSERT ────────────────────────────────────────────────────────────────────

async def upsert_point(case_id: str, vector: list[float], payload: dict[str, Any]) -> None:
    client = _get_client()
    point = PointStruct(id=case_id, vector=vector, payload=payload)
    await asyncio.to_thread(client.upsert, COLLECTION, points=[point], wait=True)
    logger.info("Qdrant upsert '%s' ✓", case_id)


# ── SEMANTIC SEARCH ───────────────────────────────────────────────────────────

async def semantic_search(
    query_vector: list[float],
    top_k: int = 15,
    outcome: Optional[str] = None,
    practice_area: Optional[str] = None,
    section_of_law: Optional[str] = None,
) -> list[dict]:
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
