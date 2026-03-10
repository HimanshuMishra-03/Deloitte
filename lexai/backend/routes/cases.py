"""
GET /api/cases           — list cases with optional filters
GET /api/cases/facets    — outcomes + judgment types for filter UI
GET /api/cases/{id}      — full case detail
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from services import neon
from utils.json_utils import json_response

router = APIRouter()


@router.get("/cases/facets")
async def get_facets():
    facets = await neon.get_facets()
    return json_response(facets)


@router.get("/cases")
async def list_cases(
    outcome: str | None = Query(None),
    judgment_type: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    cases = await neon.get_cases(
        outcome=outcome,
        judgment_type=judgment_type,
        limit=limit,
        offset=offset,
    )
    return json_response({"cases": cases, "total": len(cases), "limit": limit, "offset": offset})


@router.get("/cases/{case_id}")
async def get_case(case_id: str):
    case = await neon.get_case_by_id(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return json_response(case)
