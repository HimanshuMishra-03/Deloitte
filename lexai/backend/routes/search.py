"""
GET /api/search?q=query
Hybrid search: 0.6 × semantic_cosine + 0.4 × normalized_fts_rank
Optional filter: ?outcome=acquitted
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from services import neon, qdrant_service
from utils.json_utils import json_response

router = APIRouter()


@router.get("/search")
async def search(
    q: str = Query(..., min_length=3, description="Natural language search query"),
    outcome: str | None = Query(None),
    practice_area: str | None = Query(None),
    limit: int = Query(10, ge=1, le=50),
):
    query = q.strip()
    if len(query) < 3:
        raise HTTPException(status_code=400, detail="Query too short (min 3 chars)")

    # 1. Embed query (same model as indexing — consistent vector space)
    query_vector = await qdrant_service.generate_embedding(query)

    # 2. Semantic search in Qdrant (filtered)
    semantic_hits = await qdrant_service.semantic_search(
        query_vector=query_vector,
        top_k=15,
        outcome=outcome,
        practice_area=practice_area,
    )

    # 3. Full-text search in NeonDB (Postgres tsvector)
    fts_hits = await neon.fts_search(query, limit=15)

    # 4. Merge + re-rank
    # Score: 0.6 × semantic_cosine + 0.4 × normalized_fts_rank
    all_ids: set[str] = set()
    sem_map = {h["caseId"]: h["score"] for h in semantic_hits}
    fts_map = {str(h["id"]): float(h.get("fts_score", 0)) for h in fts_hits}
    all_ids = set(sem_map) | set(fts_map)

    max_fts = max(fts_map.values(), default=1.0) or 1.0

    ranked = sorted(
        [
            {
                "id": cid,
                "score": (0.6 * sem_map.get(cid, 0.0))
                       + (0.4 * fts_map.get(cid, 0.0) / max_fts),
            }
            for cid in all_ids
        ],
        key=lambda x: x["score"],
        reverse=True,
    )[:limit]

    # 5. Fetch full records from NeonDB
    import asyncio
    cases = await asyncio.gather(*[neon.get_case_by_id(r["id"]) for r in ranked])

    return json_response({
        "results": [c for c in cases if c is not None],
        "total": len(ranked),
        "query": query,
    })
