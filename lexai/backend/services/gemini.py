"""
services/gemini.py — Celery-safe Gemini client.
Model is fully driven by GEMINI_MODEL in backend/.env — change it there and
everything (rate limits, budget, logs) updates automatically.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
import threading
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

# ── Windows: set SelectorEventLoop BEFORE any asyncio or gRPC usage ───────────
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from dotenv import load_dotenv

# Anchor .env path to THIS file's location — never depends on CWD
load_dotenv(
    dotenv_path=Path(__file__).resolve().parent.parent / ".env",
    override=True,
)

from google import genai
from google.genai import types as genai_types

logger = logging.getLogger(__name__)

# ── MODEL ──────────────────────────────────────────────────────────────────────
# ✅ SINGLE SOURCE OF TRUTH: set GEMINI_MODEL in backend/.env
# Everything below (rate limits, budget, RPM throttle) derives from it automatically.
MODEL_NAME: str = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
if not _API_KEY:
    logger.error("GEMINI_API_KEY is not set — all Gemini calls will fail")

_client = genai.Client(api_key=_API_KEY)
logger.info("Gemini client ready | model=%s", MODEL_NAME)

# ── FREE TIER LIMITS ───────────────────────────────────────────────────────────
# Keys are matched longest-first so specific variants (e.g. 'flash-lite') take
# priority over their prefix ('flash'). Add new models here as needed.
_MODEL_LIMITS: dict[str, tuple[int, int]] = {
    # (RPM, RPD)
    "gemini-2.5-flash-lite": (10, 20),
    "gemini-2.5-flash":      (5,  20),
    "gemini-2.0-flash":      (15, 200),
    "gemini-1.5-flash":      (15, 1500),
    "gemini-1.5-pro":        (2,  50),
}

def _get_limits(model: str) -> tuple[int, int]:
    """Return (RPM, RPD) for *model* by longest-key substring match."""
    # Sort by key length descending so more-specific keys win.
    for key in sorted(_MODEL_LIMITS, key=len, reverse=True):
        if key in model:
            return _MODEL_LIMITS[key]
    logger.warning("Unknown model '%s' — falling back to conservative limits (5 RPM, 20 RPD)", model)
    return (5, 20)

_RPM, _RPD_LIMIT = _get_limits(MODEL_NAME)
logger.info("Rate limits | RPM=%d RPD=%d", _RPM, _RPD_LIMIT)

# ── DAILY BUDGET ───────────────────────────────────────────────────────────────
# Default to full RPD - 2 safety buffer (leaves room for testing)
DAILY_BUDGET: int = int(os.getenv("GEMINI_DAILY_BUDGET", str(max(_RPD_LIMIT - 2, 1))))

# Windows-safe budget file path using temp dir
import tempfile
_default_budget_file = str(Path(tempfile.gettempdir()) / "lexai_gemini_budget.json")
BUDGET_FILE: Path = Path(os.getenv("GEMINI_BUDGET_FILE", _default_budget_file))

_budget_file_lock = threading.Lock()  # threading.Lock — safe at module import time


class BudgetExhaustedError(RuntimeError):
    """Raised when the daily Gemini RPD budget is exhausted."""
    pass


class _DailyBudget:
    """
    Persistent daily call counter backed by a JSON file.
    Uses threading.Lock (NOT asyncio.Lock) — safe to create at module import time.
    """

    def __init__(self, budget: int, path: Path, model: str) -> None:
        self._budget = budget
        self._path   = path
        self._model  = model

    def acquire_sync(self, label: str = "") -> int:
        """Sync acquire — call from sync context or via asyncio.to_thread."""
        with _budget_file_lock:
            state = self._load()
            if state["used"] >= self._budget:
                raise BudgetExhaustedError(
                    f"Daily Gemini budget exhausted: {state['used']}/{self._budget} used "
                    f"(model: {self._model}). "
                    f"Resets in {self.seconds_until_reset() / 3600:.1f}h (UTC midnight). "
                    f"Tip: switch to GEMINI_MODEL=gemini-2.5-flash-lite for 20 RPD."
                )
            state["used"] += 1
            self._save(state)
            remaining = self._budget - state["used"]
            logger.info(
                "[budget] %s | %d/%d used | %d remaining today",
                label or "call", state["used"], self._budget, remaining,
            )
            if remaining <= 3:
                logger.warning("⚠ Only %d Gemini calls remaining today!", remaining)
            return remaining

    async def acquire(self, label: str = "") -> int:
        """Async acquire — offloads file I/O to thread pool."""
        return await asyncio.to_thread(self.acquire_sync, label)

    @property
    def used_today(self) -> int:
        return self._load()["used"]

    @property
    def remaining_today(self) -> int:
        return max(0, self._budget - self.used_today)

    def seconds_until_reset(self) -> float:
        now      = datetime.now(timezone.utc)
        midnight = (now + timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        return max(0.0, (midnight - now).total_seconds())

    def _load(self) -> dict:
        today = str(date.today())
        if self._path.exists():
            try:
                data = json.loads(self._path.read_text())
                if data.get("date") == today and data.get("model") == self._model:
                    return data
            except (json.JSONDecodeError, KeyError):
                pass
        return {"date": today, "used": 0, "model": self._model}

    def _save(self, state: dict) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(state, indent=2))


# Both names exported — orchestrator.py uses _budget_tracker, other files use _budget
_budget_tracker = _DailyBudget(DAILY_BUDGET, BUDGET_FILE, MODEL_NAME)
_budget         = _budget_tracker


# ── LAZY ASYNCIO PRIMITIVES ────────────────────────────────────────────────────
# CRITICAL: asyncio.Semaphore and asyncio.Lock CANNOT be created at module level.
# They must be created inside a running event loop.
# Celery spawns a fresh event loop per task — these primitive auto-recreate correctly.

_primitives_cache: dict = {}
_primitives_lock        = threading.Lock()


class _RpmBucket:
    """Token bucket for RPM rate limiting. Lock created lazily on first acquire()."""

    def __init__(self, rate: float, capacity: float) -> None:
        self._rate     = rate
        self._capacity = capacity
        self._tokens   = capacity
        self._last     = time.monotonic()
        self._lock: asyncio.Lock | None = None

    async def acquire(self) -> None:
        if self._lock is None:
            self._lock = asyncio.Lock()  # created inside running loop ✓
        async with self._lock:
            now          = time.monotonic()
            self._tokens = min(
                self._capacity,
                self._tokens + (now - self._last) * self._rate,
            )
            self._last = now
            if self._tokens < 1.0:
                wait = (1.0 - self._tokens) / self._rate
                logger.debug("RPM throttle: sleeping %.2fs", wait)
                await asyncio.sleep(wait)
                self._tokens = 0.0
            else:
                self._tokens -= 1.0


def _get_primitives() -> tuple[asyncio.Semaphore, _RpmBucket]:
    """Return asyncio primitives for the CURRENT running event loop (lazy init)."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        raise RuntimeError(
            "call_gemini() must be awaited inside an async context. "
            "If calling from Celery, use _run_async() in pipeline_worker.py."
        )

    loop_id = id(loop)

    if _primitives_cache.get("loop_id") == loop_id:
        return _primitives_cache["sem"], _primitives_cache["bucket"]

    with _primitives_lock:
        if _primitives_cache.get("loop_id") == loop_id:
            return _primitives_cache["sem"], _primitives_cache["bucket"]

        concurrency = int(os.getenv("LEXAI_GEMINI_CONCURRENCY", "3"))
        sem         = asyncio.Semaphore(concurrency)
        bucket      = _RpmBucket(rate=_RPM / 60, capacity=float(_RPM))

        _primitives_cache.clear()
        _primitives_cache.update({
            "loop_id": loop_id,
            "sem":     sem,
            "bucket":  bucket,
        })
        logger.debug("Asyncio primitives created for loop %d (concurrency=%d)",
                     loop_id, concurrency)

    return sem, bucket


# ── SYSTEM INSTRUCTIONS ────────────────────────────────────────────────────────
LEGAL_SYSTEM_INSTRUCTION = (
    "You are a senior Indian legal analyst with 20 years of experience reading Supreme Court "
    "and High Court judgments. Extract only what is explicitly present in the text. "
    "Never infer, never hallucinate. Return null for absent fields. "
    "Respond ONLY with valid JSON matching the provided schema — "
    "no markdown fences, no preamble, no commentary."
)

SCC_SYSTEM_INSTRUCTION = (
    "You are a senior legal reporter for Supreme Court Cases (SCC), India's premier law reporter. "
    "Write headnotes in SCC format: [Court+Bench] — [Proposition held] — [Ratio] — [Order]. "
    "Be impersonal and precise. "
    "Respond ONLY with valid JSON — no markdown fences, no preamble, no commentary."
)

VALIDATION_SYSTEM_INSTRUCTION = (
    "You are a meticulous legal fact-checker. Verify extracted fields against source text. "
    "Respond ONLY with valid JSON — no markdown fences, no preamble, no commentary."
)


# ── 429 / QUOTA ERROR HELPERS ──────────────────────────────────────────────────
def _parse_retry_after(err: str) -> float | None:
    """Extract server-recommended wait time from a Gemini 429 error body."""
    m = re.search(r'retry_delay\s*\{[^}]*seconds:\s*(\d+)', err)
    if m:
        return float(m.group(1)) + 3.0
    m = re.search(r'retry in\s*([\d.]+)s', err, re.IGNORECASE)
    if m:
        return float(m.group(1)) + 3.0
    return None


def _is_daily_quota_error(err: str) -> bool:
    """True if the error is a daily RPD exhaustion — not worth retrying today."""
    signals = [
        "PerDay", "per_day", "PerDayPerProject",
        "free_tier_requests", "GenerateRequestsPerDay",
        "RESOURCE_EXHAUSTED",
    ]
    return any(s.lower() in err.lower() for s in signals)


def _is_token_quota_error(err: str) -> bool:
    return "input_token_count" in err.lower()


def _strip_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    return text.strip()


# ── JSON REPAIR (Root Cause 4) ────────────────────────────────────────────────
def _repair_json(text: str) -> str:
    """
    Best-effort repair for Gemini truncation.
    Handles: trailing commas, unclosed braces/brackets mid-object.
    """
    text = text.strip()
    # Strip trailing commas before } or ]
    text = re.sub(r',\s*([}\]])', r'\1', text)

    opens = text.count('{') - text.count('}')
    aopen = text.count('[') - text.count(']')

    if opens > 0 or aopen > 0:
        # Truncated mid-object — find last clean boundary and clip there
        last_boundary = max(text.rfind(','), text.rfind('{'), text.rfind('['))
        if last_boundary > len(text) - 300:
            text = text[:last_boundary]
            # Recount after clip
            opens = text.count('{') - text.count('}')
            aopen = text.count('[') - text.count(']')
        text = text + (']' * max(0, aopen)) + ('}' * max(0, opens))

    return text


# ── SINGLE ATTEMPT ─────────────────────────────────────────────────────────────
async def _call_once(
    prompt: str,
    temperature: float,
    system_instruction: str,
    max_output_tokens: int = 65535,
) -> dict:
    sem, bucket = _get_primitives()
    await bucket.acquire()
    async with sem:
        response = await asyncio.to_thread(
            _client.models.generate_content,
            model=MODEL_NAME,
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=temperature,
                max_output_tokens=max_output_tokens,
                response_mime_type="application/json",
            ),
        )
    raw = _strip_fences(response.text)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Try repair before bubbling up
        repaired = _repair_json(raw)
        logger.debug("JSON repair applied | original_len=%d repaired_len=%d",
                     len(raw), len(repaired))
        return json.loads(repaired)  # raises if repair still fails


# ── PUBLIC API ─────────────────────────────────────────────────────────────────
async def call_gemini(
    prompt: str,
    temperature: float = 0.1,
    system_instruction: str = LEGAL_SYSTEM_INSTRUCTION,
    retries: int = 3,
    label: str = "",
    max_output_tokens: int = 65535,
) -> dict:
    """
    Rate-limited, budget-tracked Gemini call.

    Budget is acquired ONCE before the retry loop.
    Retries reuse the same budget slot — they do NOT burn extra RPD.
    Daily quota errors → BudgetExhaustedError immediately (no wasted retries).
    """
    await _budget_tracker.acquire(label=label or "call")

    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            return await _call_once(prompt, temperature, system_instruction, max_output_tokens)

        except json.JSONDecodeError as exc:
            logger.warning("[%s] JSON still invalid after repair (attempt %d/%d): %s",
                           label, attempt + 1, retries, exc)
            last_err = exc
            wait     = 2.0 * (2 ** attempt)

        except Exception as exc:
            err_str = str(exc)
            logger.warning("[%s] Gemini error (attempt %d/%d): %s",
                           label, attempt + 1, retries, exc)
            last_err = exc

            if _is_daily_quota_error(err_str) or _is_token_quota_error(err_str):
                raise BudgetExhaustedError(
                    f"Daily Gemini quota exhausted (model: {MODEL_NAME}). "
                    f"Resets in {_budget_tracker.seconds_until_reset() / 3600:.1f}h."
                ) from exc

            wait = _parse_retry_after(err_str) or 2.0 * (2 ** attempt)

        if attempt < retries - 1:
            logger.info("[%s] Retrying in %.1fs...", label, wait)
            await asyncio.sleep(wait)

    raise RuntimeError(
        f"[{label}] Gemini call failed after {retries} retries: {last_err}"
    ) from last_err


def budget_status() -> dict:
    """Returns current budget state as a dict. Use in /health and /api/budget endpoints."""
    return {
        "model":           MODEL_NAME,
        "used_today":      _budget_tracker.used_today,
        "remaining":       _budget_tracker.remaining_today,
        "daily_budget":    DAILY_BUDGET,
        "exhausted":       _budget_tracker.remaining_today == 0,
        "resets_in_hours": round(_budget_tracker.seconds_until_reset() / 3600, 2),
    }