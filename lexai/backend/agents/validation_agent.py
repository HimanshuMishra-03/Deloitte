"""
Agent 2 — Validation Agent
Optimized for 20 RPD: Batches all field validations into a SINGLE Gemini call.

Fixes applied:
- Compact output schema (Root Cause 3): ~70% smaller response vs verbose per-field objects
- Head+tail source window (Root Cause 2): caps prompt size so Gemini has max output budget
- max_output_tokens=65535 passed explicitly (Root Cause 1): prevents hard truncation
"""
from __future__ import annotations

import json
import logging

from models.schemas import ExtractionResult, FieldValidation, ValidationResult
from services.gemini import VALIDATION_SYSTEM_INSTRUCTION, call_gemini

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.70
PUBLISH_THRESHOLD    = 0.75

# ── SOURCE TEXT WINDOW (Root Cause 2) ─────────────────────────────────────────
# Validation doesn't need the full 50k-char document.
# Head covers: parties, issues, arguments.
# Tail covers: court reasoning, decision, outcome.
_HEAD_CHARS = 12_000
_TAIL_CHARS = 8_000


def _build_source_window(raw_text: str) -> str:
    if len(raw_text) <= _HEAD_CHARS + _TAIL_CHARS:
        return raw_text
    return (
        raw_text[:_HEAD_CHARS]
        + "\n\n[... middle of judgment omitted for validation ...]\n\n"
        + raw_text[-_TAIL_CHARS:]
    )


# ── COMPACT VALIDATION PROMPT (Root Cause 3) ──────────────────────────────────
# Replaces verbose per-field objects (sourceSpan, verbatim quotes, reasoning)
# with a minimal 3-key response per field: ok, confidence, issue.
# Total output for 10 fields ≈ 1,500 tokens — down from ~10,000.
COMPACT_VALIDATION_PROMPT = """\
Validate each extracted field against the source document.

EXTRACTED FIELDS:
{extracted_json}

SOURCE DOCUMENT (head + tail):
{source_window}

For EACH field, return a compact JSON object:
{{
  "validations": {{
    "caseTitle":           {{"ok": <bool>, "confidence": <0.0-1.0>, "issue": <string or null>}},
    "courtAndDate":        {{"ok": <bool>, "confidence": <0.0-1.0>, "issue": <string or null>}},
    "mainIssue":           {{"ok": <bool>, "confidence": <0.0-1.0>, "issue": <string or null>}},
    "petitionerArguments": {{"ok": <bool>, "confidence": <0.0-1.0>, "issue": <string or null>}},
    "respondentArguments": {{"ok": <bool>, "confidence": <0.0-1.0>, "issue": <string or null>}},
    "sectionsOfLaw":       {{"ok": <bool>, "confidence": <0.0-1.0>, "issue": <string or null>}},
    "precedentsCited":     {{"ok": <bool>, "confidence": <0.0-1.0>, "issue": <string or null>}},
    "courtReasoning":      {{"ok": <bool>, "confidence": <0.0-1.0>, "issue": <string or null>}},
    "finalDecision":       {{"ok": <bool>, "confidence": <0.0-1.0>, "issue": <string or null>}},
    "outcome":             {{"ok": <bool>, "confidence": <0.0-1.0>, "issue": <string or null>}}
  }},
  "overallConfidence": <mean of all confidence values>,
  "readyToPublish": <true if overallConfidence >= {publish_threshold} and no field has ok=false>,
  "flaggedFields": [<list of field names where ok=false>]
}}

Rules:
- "ok": false if field is unsupported, incorrect, or missing from source.
- "confidence": 0.0 if no supporting text exists.
- "issue": brief reason (≤ 15 words) if ok=false, else null.
- Respond ONLY with the JSON object above. No markdown fences, no commentary."""


async def run(case_id: str, extraction: ExtractionResult, raw_text: str) -> ValidationResult:
    """Validate all fields in a SINGLE Gemini call using a compact batch prompt."""

    extracted_dict = {
        name: val
        for name in ExtractionResult.model_fields
        if (val := getattr(extraction, name)) is not None
        and val != ""
        and val != []
    }

    if not extracted_dict:
        logger.warning("No non-null fields to validate for case %s", case_id)
        return ValidationResult(
            caseId=case_id,
            overallConfidence=0.0,
            fields={},
            readyToPublish=False,
            flaggedFields=[],
        )

    source_window = _build_source_window(raw_text)

    prompt = COMPACT_VALIDATION_PROMPT.format(
        extracted_json=json.dumps(extracted_dict, indent=2, ensure_ascii=False),
        source_window=source_window,
        publish_threshold=PUBLISH_THRESHOLD,
    )

    logger.info(
        "Batch-validating %d fields in 1 Gemini call for case %s "
        "| prompt source window: %d chars",
        len(extracted_dict), case_id, len(source_window),
    )

    raw_result: dict = await call_gemini(
        prompt,
        temperature=0.0,
        system_instruction=VALIDATION_SYSTEM_INSTRUCTION,
        label=f"validation:{case_id[:8]}",
        max_output_tokens=65535,   # Root Cause 1: never truncate
    )

    # ── Parse compact response back into FieldValidation objects ───────────────
    validations = raw_result.get("validations", {})
    fields_dict: dict[str, FieldValidation] = {}

    for name, val in extracted_dict.items():
        field_result = validations.get(name, {})
        confidence   = max(0.0, min(1.0, float(field_result.get("confidence", 0.0))))
        ok           = bool(field_result.get("ok", confidence >= CONFIDENCE_THRESHOLD))
        flagged      = not ok or confidence < CONFIDENCE_THRESHOLD
        issue        = field_result.get("issue")

        fields_dict[name] = FieldValidation(
            value=val,
            confidence=confidence,
            # sourceSpan: set issue text as span if flagged (used by orchestrator for correction hints)
            sourceSpan=issue or "",
            flagged=flagged,
            flagReason=issue if flagged else None,
        )

    # Prefer the model's computed overallConfidence; fall back to mean
    overall = float(raw_result.get("overallConfidence", 0.0))
    if not overall:
        confidences = [fv.confidence for fv in fields_dict.values()]
        overall = round(sum(confidences) / len(confidences), 4) if confidences else 0.0

    flagged_fields = raw_result.get("flaggedFields") or [
        n for n, fv in fields_dict.items() if fv.flagged
    ]
    ready = bool(raw_result.get("readyToPublish", overall >= PUBLISH_THRESHOLD and not flagged_fields))

    logger.info(
        "Validation: overall=%.2f | flagged=%d/%d | ready=%s",
        overall, len(flagged_fields), len(fields_dict), ready,
    )

    return ValidationResult(
        caseId=case_id,
        overallConfidence=overall,
        fields=fields_dict,
        readyToPublish=ready,
        flaggedFields=flagged_fields,
    )