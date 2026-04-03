"""
LexAI FastAPI Application Entry Point.
"""
from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from routes import cases, search, stream, upload, rag, analytics
from services.neon import init_db
from services.qdrant_service import init_qdrant

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: initialise DB schema + Qdrant collection."""
    logger.info("LexAI starting up...")
    await init_db()
    await init_qdrant()
    
    # Pre-load chatbot model in background (don't block startup)
    # Model loads in ~30s, server accepts requests immediately
    async def _preload_chatbot():
        try:
            from agents.chatbot_agent import _get_llm
            await _get_llm()
            logger.info("Chatbot model pre-loaded ✓")
        except Exception as e:
            logger.warning("Chatbot pre-load failed (will load on first request): %s", e)

    asyncio.create_task(_preload_chatbot())

    logger.info("LexAI ready")
    yield
    logger.info("🔒 LexAI shutting down")


app = FastAPI(
    title="LexAI — Indian Case Law Intelligence API",
    description="4-agent pipeline for structured extraction from Indian legal judgments",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        os.getenv("FRONTEND_URL", "http://localhost:3000"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Mount all routers under /api
app.include_router(upload.router, prefix="/api", tags=["Upload"])
app.include_router(cases.router, prefix="/api", tags=["Cases"])
app.include_router(search.router, prefix="/api", tags=["Search"])
app.include_router(stream.router, prefix="/api", tags=["Stream"])
app.include_router(analytics.router, prefix="/api", tags=["Analytics"])
app.include_router(rag.router)   # has its own /api/rag prefix


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "LexAI"}
