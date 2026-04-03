"""
Re-index all existing cases in Qdrant using the unified MiniLM-L6-v2 model.
Run ONCE after changing EMBED_MODEL or EMBED_DIM.

Usage:
  cd lexai/backend
  venv\\Scripts\\activate
  python scripts/reindex_all.py
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


async def reindex():
    from services.neon import get_pool
    from services.qdrant_service import embed, init_qdrant, upsert_point

    # Step 1: Init Qdrant collection (creates if missing)
    await init_qdrant()
    logger.info("Qdrant collection ready ✓")

    # Step 2: Fetch all case IDs from NeonDB
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, case_title, headnote, main_issue,
                   petitioner_args, respondent_args,
                   sections_of_law, precedents_cited,
                   court_reasoning, final_decision,
                   outcome, practice_area, judgment_type,
                   short_summary
            FROM cases
            ORDER BY processed_at DESC
        """)

    if not rows:
        logger.info("No cases found in NeonDB — nothing to re-index.")
        return

    logger.info("Found %d cases to re-index", len(rows))

    success = 0
    failed = 0

    for i, row in enumerate(rows, 1):
        case_id = row["id"]
        title = row["case_title"] or "Unknown"
        logger.info("[%d/%d] Indexing: %s", i, len(rows), title[:60])

        try:
            # Build index text from richest fields
            parts = []
            for field in ["headnote", "main_issue", "court_reasoning",
                          "short_summary"]:
                val = row[field]
                if val:
                    if isinstance(val, list):
                        parts.append(" ".join(str(v) for v in val))
                    else:
                        parts.append(str(val))

            for field in ["sections_of_law", "precedents_cited"]:
                val = row[field]
                if val and isinstance(val, list):
                    parts.append(" ".join(str(v) for v in val))

            index_text = " ".join(parts)
            if not index_text.strip():
                logger.warning("  ⚠ Empty index text — skipping")
                failed += 1
                continue

            # Embed with unified model
            vector = await embed(index_text)

            # Build lightweight Qdrant payload
            payload = {
                "caseTitle":    title,
                "outcome":      row["outcome"] or "other",
                "practiceArea": row["practice_area"] or [],
                "judgmentType":  row["judgment_type"] or "",
                "shortSummary": row["short_summary"] or "",
            }

            await upsert_point(case_id, vector, payload)
            success += 1

        except Exception as e:
            logger.error("  ✗ Failed: %s", e)
            failed += 1

    logger.info("Done: %d indexed, %d failed", success, failed)


if __name__ == "__main__":
    asyncio.run(reindex())
