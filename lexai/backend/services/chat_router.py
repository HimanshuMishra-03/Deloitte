"""
services/chat_router.py
───────────────────────
Classifies every incoming question into one of three modes:
  hardcoded  → instant answer, no LLM, no Qdrant
  global_rag → search ALL indexed cases in Qdrant
  case_rag   → search THIS case only (via LRU cache)
"""
from __future__ import annotations
import re

# Questions about how LexAI itself works
_SYSTEM_TRIGGERS = {
    "how does", "how do i", "how to", "what is lexai", "what can",
    "quota", "api calls", "remaining", "api limit", "free tier",
    "upload", "pipeline", "agent", "confidence", "accuracy",
    "analytics", "search works", "what happens when", "steps",
    "rag", "embedding", "qdrant", "vector", "features", "workflow",
    "explain", "capabilities", "how many cases", "total cases",
    "what does confidence", "processing time", "how long",
    "who are you", "tell me about yourself", "what can you do",
    "how does the chatbot", "how do you work", "are you ai",
}

# Cross-case patterns — search ALL cases even on a case page
_CROSS_CASE_RE = re.compile(
    r"across\s+(all|my)\s+case"
    r"|common\s+(in|across|between|among)"
    r"|all\s+(my\s+)?cases"
    r"|every\s+case"
    r"|compare\s+case"
    r"|pattern(s)?\s+(in|across|among)"
    r"|which\s+(case|judgment)\s+(has|have|contain)"
    r"|find\s+(in\s+)?all"
    r"|search\s+(all|every|across)"
    r"|most\s+(cited|common|frequent|used)"
    r"|recurring\s+(theme|issue|section|argument)"
    r"|(petitioner|respondent|court|section|ipc|article)\s+across",
    re.IGNORECASE,
)


def classify(question: str, page: str, case_id: str | None) -> str:
    """
    Returns: 'hardcoded' | 'global_rag' | 'case_rag'

    page:    'dashboard' | 'analytics' | 'search' | 'case'
    case_id: present only on case pages
    """
    q = question.lower().strip()

    # Cross-case intent overrides everything — even on a case page
    if _CROSS_CASE_RE.search(q):
        return "global_rag"

    # System/how-it-works questions
    for trigger in _SYSTEM_TRIGGERS:
        if trigger in q:
            return "hardcoded"

    # On a specific case page → search that case
    if case_id and page == "case":
        return "case_rag"

    # On dashboard/analytics/search without a case → global search
    return "global_rag"
