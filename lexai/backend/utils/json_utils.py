"""
utils/json_utils.py — Custom JSON serialization for asyncpg + FastAPI.

asyncpg returns Python-native types from PostgreSQL that the standard
json.dumps cannot handle. Use `json_response()` instead of JSONResponse()
for any route that returns DB data.

Types handled:
  - datetime.datetime  → ISO 8601 string  e.g. "2026-03-10T00:32:46+00:00"
  - datetime.date      → ISO 8601 string  e.g. "2026-03-10"
  - decimal.Decimal    → float
  - uuid.UUID          → string
  - asyncpg.Record     → dict  (by class-name duck-typing)
  - bytes              → base64 string
  - set / frozenset    → list
"""
from __future__ import annotations

import base64
import decimal
import json
import uuid
from datetime import date, datetime
from typing import Any

from fastapi.responses import Response


def _default(obj: Any) -> Any:
    """
    Custom fallback for json.dumps.
    Raises TypeError for any unrecognised type so bugs surface immediately.
    """
    # datetime MUST come before date — datetime is a subclass of date
    if isinstance(obj, datetime):
        return obj.isoformat()

    if isinstance(obj, date):
        return obj.isoformat()

    if isinstance(obj, decimal.Decimal):
        return float(obj)

    if isinstance(obj, uuid.UUID):
        return str(obj)

    if isinstance(obj, bytes):
        return base64.b64encode(obj).decode("utf-8")

    if isinstance(obj, (set, frozenset)):
        return list(obj)

    # asyncpg.Record behaves like a dict — avoid importing asyncpg here
    if obj.__class__.__name__ == "Record":
        return dict(obj)

    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")


def to_json(data: Any, indent: int | None = None) -> str:
    """Serialize *data* to a JSON string, handling all asyncpg/Python types."""
    return json.dumps(data, default=_default, ensure_ascii=False, indent=indent)


def json_response(data: Any, status_code: int = 200) -> Response:
    """
    Return a FastAPI Response with correctly serialized JSON.

    Use this instead of JSONResponse() for any route that touches the DB.
    JSONResponse uses plain json.dumps with no custom encoder, so datetime
    objects raise TypeError. This function pre-serializes with _default().
    """
    return Response(
        content=to_json(data),
        status_code=status_code,
        media_type="application/json",
    )


def serialize_record(record: Any) -> dict | None:
    """Convert a single asyncpg Record (or dict) to a plain, JSON-safe dict."""
    if record is None:
        return None
    raw = dict(record) if hasattr(record, "items") else record
    return json.loads(to_json(raw))


def serialize_records(records: list) -> list[dict]:
    """Convert a list of asyncpg Records to a list of plain, JSON-safe dicts."""
    return [serialize_record(r) for r in (records or [])]
