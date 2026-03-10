"""
LexAI — Pydantic v2 data models shared across all agents and services.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field


# ── Agent 1 ──────────────────────────────────────────────────────────────────

class ExtractionResult(BaseModel):
    caseTitle: str = ""
    courtAndDate: str = ""
    mainIssue: str = ""
    petitionerArguments: list[str] = Field(default_factory=list)
    respondentArguments: list[str] = Field(default_factory=list)
    sectionsOfLaw: list[str] = Field(default_factory=list)
    precedentsCited: list[str] = Field(default_factory=list)
    courtReasoning: str = ""
    finalDecision: str = ""
    outcome: Literal[
        "allowed", "dismissed", "partly allowed", "partially allowed",
        "acquitted", "convicted", "remanded", "modified",
        "set aside", "upheld", "disposed", "disposed of",
        "quashed", "stayed", "withdrawn", "other",
    ] = "other"


# ── Agent 2 ──────────────────────────────────────────────────────────────────

class FieldValidation(BaseModel):
    value: str | list[str] = ""
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    sourceSpan: str = ""
    flagged: bool = False
    flagReason: Optional[str] = None


class ValidationResult(BaseModel):
    caseId: str
    overallConfidence: float = 0.0
    fields: dict[str, FieldValidation] = Field(default_factory=dict)
    readyToPublish: bool = False
    flaggedFields: list[str] = Field(default_factory=list)


# ── Agent 3 ──────────────────────────────────────────────────────────────────

class HeadnoteResult(BaseModel):
    headnote: str = ""
    shortSummary: str = ""
    keywords: list[str] = Field(default_factory=list)
    practiceArea: list[str] = Field(default_factory=list)
    judgmentType: str = ""
    coramJudges: list[str] = Field(default_factory=list)


# ── SSE Events ───────────────────────────────────────────────────────────────

class PipelineEvent(BaseModel):
    stage: Literal["extraction", "validation", "headnote", "indexing", "complete", "error"]
    status: Literal["running", "done", "retrying", "failed"]
    message: Optional[str] = None
    preview: Optional[dict] = None
    caseId: Optional[str] = None
    error: Optional[str] = None


# ── Database ─────────────────────────────────────────────────────────────────

class CaseRecord(BaseModel):
    id: str
    file_name: str
    case_title: Optional[str] = None
    court_and_date: Optional[str] = None
    main_issue: Optional[str] = None
    petitioner_args: Optional[list[str]] = None
    respondent_args: Optional[list[str]] = None
    sections_of_law: Optional[list[str]] = None
    precedents_cited: Optional[list[str]] = None
    court_reasoning: Optional[str] = None
    final_decision: Optional[str] = None
    outcome: Optional[str] = None
    headnote: Optional[str] = None
    short_summary: Optional[str] = None
    keywords: Optional[list[str]] = None
    practice_area: Optional[list[str]] = None
    judgment_type: Optional[str] = None
    coram_judges: Optional[list[str]] = None
    overall_confidence: Optional[float] = None
    validation_detail: Optional[dict] = None
    created_at: Optional[datetime] = None
    processed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SearchResult(BaseModel):
    cases: list[CaseRecord]
    total: int
    query: str
