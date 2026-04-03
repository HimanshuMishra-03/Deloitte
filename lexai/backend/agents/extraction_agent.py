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
You are a senior Indian legal analyst. Extract the following structured fields from the judgment below with MAXIMUM accuracy.

SCHEMA:
{{
  "caseTitle": "string — Full case name as it appears in the header (e.g., 'X vs Y')",
  "courtAndDate": "string — Court name and date of judgment (e.g., 'Supreme Court of India, January 15, 2024')",
  "mainIssue": "string — The central legal question or dispute in 3-5 clear sentences. Be comprehensive.",
  "petitionerArguments": ["string — One distinct argument per entry. Extract ALL arguments raised by the petitioner/appellant. Aim for 3-8 items."],
  "respondentArguments": ["string — One distinct argument per entry. Extract ALL arguments by the respondent. Aim for 3-8 items."],
  "sectionsOfLaw": ["string — Format: 'Act Name, Section Number — brief description'. Include ALL statutes cited."],
  "precedentsCited": ["string — Format: 'Party v Party (Year) Volume Reporter Page'. Include ALL cases cited."],
  "courtReasoning": "string — Detailed analysis of how the court reasoned, key legal principles applied, and why. 5-8 sentences minimum.",
  "finalDecision": "string — The operative part of the order. What did the court actually order?",
  "outcome": "one of: allowed | dismissed | partly allowed | acquitted | convicted | remanded | modified | set aside | upheld | disposed of | quashed | stayed | withdrawn | other"
}}

CRITICAL RULES:
1. Extract VERBATIM from the judgment text. Do not paraphrase or hallucinate.
2. 'outcome' MUST be exactly one of the listed values. Map the court's decision to the closest match:
   - "appeal allowed" → "allowed"
   - "appeal dismissed" → "dismissed"  
   - "petition partly allowed" → "partly allowed"
   - "conviction upheld" → "convicted"
   - "acquittal confirmed" → "acquitted"
   - "matter remanded" → "remanded"
   - "order set aside" → "set aside"
   - "disposed of" → "disposed of"
3. For petitionerArguments and respondentArguments: Extract EVERY distinct legal argument. Do NOT combine multiple arguments into one.
4. For sectionsOfLaw: Include every statute, section, article, and rule mentioned.
5. For precedentsCited: Include every case name referenced, even briefly.
6. If a field genuinely has no data, use "" for strings or [] for arrays. Never omit fields.

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
