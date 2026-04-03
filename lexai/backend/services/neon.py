"""
NeonDB (Postgres) service using asyncpg.
Single source of truth for all structured case data.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from datetime import date, datetime, timezone
from typing import Any, Optional

import asyncpg

logger = logging.getLogger(__name__)

_pools: dict[int, asyncpg.Pool] = {}


async def get_pool() -> asyncpg.Pool:
    """
    Returns a loop-aware asyncpg pool.
    Celery workers create fresh event loops per task; sharing a global pool
    across loops causes InterfaceError/RuntimeError.
    """
    global _pools
    loop = asyncio.get_running_loop()
    loop_id = id(loop)

    if loop_id not in _pools or _pools[loop_id].is_closing():
        dsn = os.environ["DATABASE_URL"]
        # Use a smaller pool per loop to avoid hitting Neon connection limits
        _pools[loop_id] = await asyncpg.create_pool(
            dsn, 
            min_size=1, 
            max_size=5, 
            command_timeout=60
        )
        logger.debug("Created new asyncpg pool for loop %d", loop_id)
    
    return _pools[loop_id]


async def close_pool() -> None:
    """Closes the pool associated with the current running event loop."""
    global _pools
    try:
        loop = asyncio.get_running_loop()
        loop_id = id(loop)
        if loop_id in _pools:
            pool = _pools.pop(loop_id)
            await pool.close()
            logger.debug("Closed asyncpg pool for loop %d", loop_id)
    except RuntimeError:
        pass  # No running loop


# ── TYPE HELPERS ──────────────────────────────────────────────────────────────

def _to_dt(value: Any) -> datetime | None:
    """
    Safely convert any datetime-like value → timezone-aware datetime.
    asyncpg requires datetime instances for TIMESTAMPTZ — never strings.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, str):
        if not value.strip():
            return None
        try:
            normalized = value.replace("Z", "+00:00")
            dt = datetime.fromisoformat(normalized)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            return None
    return None


def _to_jsonb(value: Any) -> str | None:
    """Convert Python list/dict → JSON string for asyncpg JSONB columns."""
    if value is None:
        return None
    if isinstance(value, str):
        return value  # already serialized
    try:
        return json.dumps(value, ensure_ascii=False)
    except (TypeError, ValueError):
        return None


# ── SCHEMA INIT ──────────────────────────────────────────────────────────────

async def init_db() -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS cases (
                id                  TEXT PRIMARY KEY,
                file_name           TEXT NOT NULL,

                case_title          TEXT,
                court_and_date      TEXT,
                main_issue          TEXT,
                petitioner_args     JSONB,
                respondent_args     JSONB,
                sections_of_law     JSONB,
                precedents_cited    JSONB,
                court_reasoning     TEXT,
                final_decision      TEXT,
                outcome             TEXT CHECK (outcome IN
                                      ('acquitted','convicted','remanded','modified','dismissed')),

                headnote            TEXT,
                short_summary       TEXT,
                keywords            JSONB,
                practice_area       JSONB,
                judgment_type       TEXT,
                coram_judges        JSONB,

                overall_confidence  REAL,
                validation_detail   JSONB,

                created_at          TIMESTAMPTZ DEFAULT NOW(),
                processed_at        TIMESTAMPTZ
            )
        """)

        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_cases_fts ON cases
            USING GIN (
                to_tsvector('english',
                    coalesce(case_title,'') || ' ' ||
                    coalesce(main_issue,'') || ' ' ||
                    coalesce(headnote,'')
                )
            )
        """)

        await conn.execute("CREATE INDEX IF NOT EXISTS idx_outcome ON cases(outcome)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_judgment_type ON cases(judgment_type)")

    logger.info("NeonDB schema initialised ✓")


# ── OUTCOME NORMALIZER ───────────────────────────────────────────────────────
# Gemini returns many valid phrases for the same outcome concept.
# This maps everything to the values allowed by the DB CHECK constraint.

_VALID_OUTCOMES = {
    "allowed", "dismissed", "partly allowed", "partially allowed",
    "acquitted", "convicted", "remanded", "modified",
    "set aside", "upheld", "disposed", "disposed of",
    "quashed", "stayed", "withdrawn", "other",
}

_OUTCOME_ALIASES: dict[str, str] = {
    "appeal allowed":                   "allowed",
    "appeal is allowed":                "allowed",
    "writ allowed":                     "allowed",
    "petition allowed":                 "allowed",
    "revision allowed":                 "allowed",
    "allowed in part":                  "partly allowed",
    "allowed partially":                "partly allowed",
    "appeal partly allowed":            "partly allowed",
    "appeal dismissed":                 "dismissed",
    "petition dismissed":               "dismissed",
    "dismissed with costs":             "dismissed",
    "dismissed in limine":              "dismissed",
    "dismissed as withdrawn":           "withdrawn",
    "dismissed as infructuous":         "disposed of",
    "order set aside":                  "set aside",
    "judgment set aside":               "set aside",
    "impugned order set aside":         "set aside",
    "reversed":                         "set aside",
    "reversed and set aside":           "set aside",
    "remanded back":                    "remanded",
    "matter remanded":                  "remanded",
    "remitted":                         "remanded",
    "remitted back":                    "remanded",
    "remanded for fresh consideration": "remanded",
    "disposed of":                      "disposed of",
    "matter disposed of":               "disposed of",
    "disposed as infructuous":          "disposed of",
    "conviction upheld":                "convicted",
    "conviction confirmed":             "convicted",
    "sentence upheld":                  "convicted",
    "acquittal upheld":                 "acquitted",
    "acquittal confirmed":              "acquitted",
    "acquittal set aside":              "convicted",
    "confirmed":                        "upheld",
    "order upheld":                     "upheld",
    "order confirmed":                  "upheld",
    "quashed and set aside":            "quashed",
    "writ quashed":                     "quashed",
    "notification quashed":             "quashed",
    "stay granted":                     "stayed",
    "sentence modified":                "modified",
    "order modified":                   "modified",
}

_FUZZY_PRIORITY = [
    "partly allowed", "partially allowed", "disposed of",
    "quashed and set aside", "set aside", "quashed",
    "remanded", "acquitted", "convicted", "stayed",
    "withdrawn", "modified", "upheld", "dismissed",
    "allowed", "disposed",
]


def _normalize_outcome(raw: str | None) -> str:
    """
    Map any Gemini-returned outcome string to a valid DB CHECK value.
    Never raises — worst case returns 'other'.
    """
    if not raw:
        return "other"
    cleaned = re.sub(r'[.,;:]+$', '', raw.strip().lower()).strip()
    if cleaned in _VALID_OUTCOMES:
        return cleaned
    if cleaned in _OUTCOME_ALIASES:
        return _OUTCOME_ALIASES[cleaned]
    for candidate in _FUZZY_PRIORITY:
        if candidate in cleaned:
            return candidate
    logger.warning("Unknown outcome '%s' → stored as 'other'. Add to _OUTCOME_ALIASES.", raw)
    return "other"


# ── INSERT ────────────────────────────────────────────────────────────────────

async def insert_case(data: dict[str, Any]) -> None:
    """
    Insert a processed case into NeonDB.
    All TIMESTAMPTZ columns are wrapped with _to_dt() to satisfy asyncpg's
    strict type requirement — it rejects ISO strings for TIMESTAMPTZ.
    All JSONB columns are wrapped with _to_jsonb() for consistency.
    """
    pool = await get_pool()
    now  = datetime.now(timezone.utc)

    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO cases (
                id, file_name,
                case_title, court_and_date, main_issue,
                petitioner_args, respondent_args,
                sections_of_law, precedents_cited,
                court_reasoning, final_decision, outcome,
                headnote, short_summary, keywords,
                practice_area, judgment_type, coram_judges,
                overall_confidence, validation_detail,
                processed_at
            ) VALUES (
                $1,  $2,
                $3,  $4,  $5,
                $6,  $7,
                $8,  $9,
                $10, $11, $12,
                $13, $14, $15,
                $16, $17, $18,
                $19, $20,
                $21
            )
            ON CONFLICT (id) DO UPDATE SET
                overall_confidence = EXCLUDED.overall_confidence,
                validation_detail  = EXCLUDED.validation_detail,
                processed_at       = EXCLUDED.processed_at
            """,
            # ── Identifiers ────────────────────────────────────────────────────
            data["id"],
            data.get("file_name", ""),
            # ── Extraction fields ──────────────────────────────────────────────
            data.get("caseTitle", ""),
            data.get("courtAndDate", ""),
            data.get("mainIssue", ""),
            # ── JSONB arrays ───────────────────────────────────────────────────
            _to_jsonb(data.get("petitionerArguments", [])),
            _to_jsonb(data.get("respondentArguments", [])),
            _to_jsonb(data.get("sectionsOfLaw", [])),
            _to_jsonb(data.get("precedentsCited", [])),
            # ── Text fields ────────────────────────────────────────────────────
            data.get("courtReasoning", ""),
            data.get("finalDecision", ""),
            _normalize_outcome(data.get("outcome")),
            # ── Headnote fields ────────────────────────────────────────────────
            data.get("headnote", ""),
            data.get("shortSummary", ""),
            _to_jsonb(data.get("keywords", [])),
            _to_jsonb(data.get("practiceArea", [])),
            data.get("judgmentType", ""),
            _to_jsonb(data.get("coramJudges", [])),
            # ── Validation metadata ────────────────────────────────────────────
            data.get("overallConfidence", 0.0),
            _to_jsonb(data.get("validationDetail", {})),
            # ── Timestamp — MUST be a datetime object, never a string ──────────
            _to_dt(data.get("processedAt")) or now,
        )


# ── GET ONE ───────────────────────────────────────────────────────────────────

async def get_case_by_id(case_id: str) -> Optional[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM cases WHERE id = $1", case_id)
    if row is None:
        return None
    return _row_to_dict(row)


# ── GET MANY ──────────────────────────────────────────────────────────────────

async def get_cases(
    outcome: Optional[str] = None,
    judgment_type: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
) -> list[dict]:
    pool = await get_pool()
    conditions = ["1=1"]
    params: list[Any] = []

    if outcome:
        params.append(outcome)
        conditions.append(f"outcome = ${len(params)}")
    if judgment_type:
        params.append(judgment_type)
        conditions.append(f"judgment_type = ${len(params)}")

    params += [limit, offset]
    where = " AND ".join(conditions)
    query = f"""
        SELECT id, case_title, court_and_date, outcome, short_summary,
               judgment_type, overall_confidence, processed_at
        FROM cases
        WHERE {where}
        ORDER BY processed_at DESC NULLS LAST
        LIMIT ${len(params)-1} OFFSET ${len(params)}
    """

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
    return [_row_to_dict(r) for r in rows]


# ── FULL-TEXT SEARCH ──────────────────────────────────────────────────────────

async def fts_search(query: str, limit: int = 15) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, case_title, short_summary, outcome, overall_confidence,
                   ts_rank(
                       to_tsvector('english',
                           coalesce(case_title,'') || ' ' ||
                           coalesce(main_issue,'') || ' ' ||
                           coalesce(headnote,'')
                       ),
                       plainto_tsquery('english', $1)
                   ) AS fts_score
            FROM cases
            WHERE to_tsvector('english',
                coalesce(case_title,'') || ' ' ||
                coalesce(main_issue,'') || ' ' ||
                coalesce(headnote,'')
            ) @@ plainto_tsquery('english', $1)
            ORDER BY fts_score DESC
            LIMIT $2
        """, query, limit)
    return [_row_to_dict(r) for r in rows]


# ── FACETS ────────────────────────────────────────────────────────────────────

async def get_facets() -> dict[str, list[str]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        outcomes = await conn.fetch(
            "SELECT DISTINCT outcome FROM cases WHERE outcome IS NOT NULL ORDER BY outcome"
        )
        types = await conn.fetch(
            "SELECT DISTINCT judgment_type FROM cases WHERE judgment_type IS NOT NULL ORDER BY judgment_type"
        )
    return {
        "outcomes":      [r["outcome"] for r in outcomes],
        "judgmentTypes": [r["judgment_type"] for r in types],
    }


# ── HELPERS ───────────────────────────────────────────────────────────────────

def _row_to_dict(row: asyncpg.Record) -> dict:
    """
    Convert an asyncpg Record to a plain, JSON-safe dict.

    - JSONB columns stored as strings are parsed back to Python objects.
    - datetime / date objects are converted to ISO 8601 strings so that
      FastAPI's json.dumps never sees a raw datetime.
    """
    d = dict(row)
    for key, val in d.items():
        # Parse JSONB columns stored as strings
        if isinstance(val, str):
            try:
                d[key] = json.loads(val)
            except (json.JSONDecodeError, TypeError):
                pass
        # Convert datetime → ISO string (datetime is a subclass of date,
        # so this check must come before the date check)
        elif isinstance(val, datetime):
            d[key] = val.isoformat()
        elif isinstance(val, date):
            d[key] = val.isoformat()
    return d
