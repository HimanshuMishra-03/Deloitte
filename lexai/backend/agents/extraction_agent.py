"""
Agent 1 — Extraction Agent
Optimized for 20 RPD: Uses single-call extraction for documents up to 2.8M chars.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from models.schemas import ExtractionResult
from services.gemini import LEGAL_SYSTEM_INSTRUCTION, call_gemini

logger = logging.getLogger(__name__)

# ~700k tokens — safely under the 1M token limit of Gemini 2.5/2.0 Flash
MAX_SINGLE_CALL_CHARS = 2_800_000

EXTRACTION_PROMPT_TEMPLATE = """\
Extract the following structured fields from the Indian legal judgment text provided below.

SCHEMA:
{{
  "caseTitle": "string",
  "courtAndDate": "string",
  "mainIssue": "string (2-3 sentences describing the main legal question)",
  "petitionerArguments": ["string — one discrete argument point per item"],
  "respondentArguments": ["string — one discrete argument point per item"],
  "sectionsOfLaw": ["string — format: 'Act § Number — short description'"],
  "precedentsCited": ["string — format: 'Party v Party (Year) Volume Reporter Page'"],
  "courtReasoning": "string (4-6 sentences on how the court reasoned)",
  "finalDecision": "string",
  "outcome": "one of: acquitted | convicted | remanded | modified | dismissed"
}}

Rules:
- Return null / empty string / empty array for absent fields.
- 'outcome' MUST be exactly one of: acquitted, convicted, remanded, modified, dismissed.
- Extract only what is explicitly written. No hallucinations.

JUDGMENT TEXT:
{judgment_text}
"""

CORRECTION_PROMPT_TEMPLATE = """\
You previously extracted fields from an Indian judgment. Some fields were flagged as
inaccurate or unsupported. Re-extract ONLY the flagged fields listed below.

CORRECTION HINTS (field → problem + evidence from source):
{correction_hints_json}

FIELDS TO RE-EXTRACT: {fields_list}

FULL DOCUMENT TEXT:
{judgment_text}

Return ONLY a JSON object containing the re-extracted values for the flagged fields:
{{
  "fieldName1": <corrected value>,
  "fieldName2": <corrected value>,
  ...
}}
Use null if a field genuinely does not exist in the document.
"""

async def run(raw_text: str) -> ExtractionResult:
    """Extract all 9 fields in a SINGLE Gemini call."""
    if len(raw_text) > MAX_SINGLE_CALL_CHARS:
        logger.warning(
            "Document exceeds single-call limit (%d chars). Truncating. "
            "This should not happen for normal judgments.", len(raw_text)
        )
        raw_text = raw_text[:MAX_SINGLE_CALL_CHARS]

    prompt = EXTRACTION_PROMPT_TEMPLATE.format(judgment_text=raw_text)
    result = await call_gemini(
        prompt, 
        temperature=0.1, 
        system_instruction=LEGAL_SYSTEM_INSTRUCTION
    )
    return ExtractionResult(**result)

async def run_with_corrections(
    raw_text: str,
    fields_to_fix: list[str],
    correction_hints: dict,
) -> dict:
    """Re-extract specific flagged fields with correction context. Costs 1 RPD."""
    prompt = CORRECTION_PROMPT_TEMPLATE.format(
        correction_hints_json=json.dumps(correction_hints, indent=2),
        fields_list=", ".join(fields_to_fix),
        judgment_text=raw_text[:MAX_SINGLE_CALL_CHARS],
    )
    return await call_gemini(
        prompt, 
        temperature=0.1, 
        system_instruction=LEGAL_SYSTEM_INSTRUCTION
    )
