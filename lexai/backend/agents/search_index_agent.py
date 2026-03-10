"""
Agent 4 — Search Index Agent
Zero LLM calls. Pure computation:
  1. Build embedding from richest text fields
  2. Write structured case to NeonDB
  3. Upsert vector + lightweight payload to Qdrant
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from models.schemas import ExtractionResult, HeadnoteResult, ValidationResult
from services import neon, qdrant_service

logger = logging.getLogger(__name__)


async def run(
    case_id: str,
    file_name: str,
    extraction: ExtractionResult,
    validation: ValidationResult,
    headnote: HeadnoteResult,
) -> str:
    """Write case to NeonDB and Qdrant, return case_id on success."""

    # ── STEP 1: Build embedding index text ───────────────────────────────────
    index_text = " ".join([
        headnote.headnote,
        extraction.mainIssue,
        extraction.courtReasoning,
        " ".join(headnote.keywords),
        " ".join(extraction.sectionsOfLaw),
        " ".join(extraction.precedentsCited),
    ])

    # ── STEP 2: Generate 384-dim embedding (local model, zero API cost) ──────
    embedding = await qdrant_service.generate_embedding(index_text)

    # ── STEP 3: Write structured record to NeonDB ─────────────────────────────
    case_data = {
        "id": case_id,
        "file_name": file_name,
        **extraction.model_dump(),
        "headnote": headnote.headnote,
        "shortSummary": headnote.shortSummary,
        "keywords": headnote.keywords,
        "practiceArea": headnote.practiceArea,
        "judgmentType": headnote.judgmentType,
        "coramJudges": headnote.coramJudges,
        "overallConfidence": validation.overallConfidence,
        "validationDetail": {
            name: fv.model_dump() for name, fv in validation.fields.items()
        },
        "processedAt": datetime.now(timezone.utc).isoformat(),
    }
    await neon.insert_case(case_data)
    logger.info("NeonDB insert '%s' ✓", case_id)

    # ── STEP 4: Upsert vector + lightweight payload to Qdrant ────────────────
    # Only filter-relevant fields in Qdrant payload — full data lives in NeonDB
    payload = {
        "caseTitle": extraction.caseTitle,
        "outcome": extraction.outcome,
        "practiceArea": headnote.practiceArea,
        "sectionsOfLaw": extraction.sectionsOfLaw,
        "judgmentType": headnote.judgmentType,
        "shortSummary": headnote.shortSummary,
    }
    await qdrant_service.upsert_point(case_id, embedding, payload)

    return case_id
