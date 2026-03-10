"""
Agent 3 — Headnote Agent
Optimized for 20 RPD: Uses only structured JSON from previous agents.
"""
from __future__ import annotations

import logging

from models.schemas import ExtractionResult, HeadnoteResult
from services.gemini import SCC_SYSTEM_INSTRUCTION, call_gemini

logger = logging.getLogger(__name__)

HEADNOTE_PROMPT = """\
Generate a legal headnote and metadata from the following validated case data.
Do NOT re-read a source document — use only the structured JSON provided.

CASE DATA:
{case_json}

Return JSON:
{{
  "headnote":     "<150-200 word SCC-format headnote: [Court + Bench] — [Legal proposition held] — [Ratio decidendi] — [Operative order]>",
  "shortSummary": "<Exactly 2 sentences for card view>",
  "keywords":     ["keyword1", ...],
  "practiceArea": ["area1", ...],
  "judgmentType": "<Criminal Appeal | Writ Petition | Civil Revision | ...>",
  "coramJudges":  ["Judge Name 1", ...]
}}"""

async def run(extraction: ExtractionResult) -> HeadnoteResult:
    """Generate SCC-format headnote from validated extraction result."""
    # Use model_dump_json for a compact, standard representation
    case_json = extraction.model_dump_json(indent=2)
    
    prompt = HEADNOTE_PROMPT.format(case_json=case_json)
    
    result = await call_gemini(
        prompt, 
        temperature=0.3, 
        system_instruction=SCC_SYSTEM_INSTRUCTION
    )
    
    return HeadnoteResult(**result)
