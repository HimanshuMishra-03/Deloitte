# ⚖ LexAI — Indian Case Law Intelligence

Agentic AI system converting Indian legal judgment PDFs/DOCX into structured, searchable intelligence.
**Stack:** Python 3.11 + FastAPI · Next.js 14 · NeonDB · Qdrant · Celery + Redis

---

## Quick Start

### 1. Infrastructure (local dev)
```bash
docker-compose up -d   # Starts Qdrant :6333 + Redis :6379
```

### 2. Backend
```bash
cd backend
cp .env.example .env           # Fill in GEMINI_API_KEY, DATABASE_URL, QDRANT_URL, REDIS_URL
pip install -r requirements.txt

# Terminal A — API server
uvicorn main:app --reload --port 8000

# Terminal B — Celery worker (separate process)
celery -A workers.pipeline_worker worker --loglevel=info
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev    # → http://localhost:3000
```

---

## Environment Variables (`backend/.env`)

| Variable | Source |
|---|---|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) |
| `DATABASE_URL` | [neon.tech](https://neon.tech) → Connection string |
| `QDRANT_URL` | [cloud.qdrant.io](https://cloud.qdrant.io) OR `http://localhost:6333` |
| `QDRANT_API_KEY` | Qdrant Cloud only (leave empty for local) |
| `REDIS_URL` | [upstash.com](https://upstash.com) OR `redis://localhost:6379` |

---

## Architecture

```
Upload PDF/DOCX
     │
     ▼
[Celery Queue]
     │
     ▼
Agent 1: Extraction    → 9 structured fields via Gemini 2.5 Flash
     │
Agent 2: Validation   → Per-field confidence scores + sourceSpan evidence
     │                  (Retry flagged fields once)
Agent 3: Headnote     → SCC-format headnote + keywords + practice area
     │
Agent 4: Search Index → Embed (local all-MiniLM-L6-v2) → NeonDB + Qdrant
     │
     ▼
SSE stream → Frontend live view → Auto-redirect to case detail
```

### Search (Hybrid)
`score = 0.6 × semantic_cosine (Qdrant) + 0.4 × normalized_fts (NeonDB tsvector)`

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/upload` | Upload PDF/DOCX, returns `{jobId}` |
| GET | `/api/stream/{jobId}` | SSE pipeline events |
| GET | `/api/cases` | List cases (filters: outcome, judgment_type) |
| GET | `/api/cases/facets` | Distinct outcomes + judgment types |
| GET | `/api/cases/{id}` | Full case detail |
| GET | `/api/search?q=` | Hybrid semantic + FTS search |
| GET | `/api/health` | Health check |

---

## Free Tier Limits

| Service | Free Limit |
|---|---|
| NeonDB | 0.5 GB, 10 compute hours/month |
| Qdrant Cloud | 1 GB, 1 collection |
| Gemini 2.5 Flash | 15 RPM, 1M tokens/day |
| sentence-transformers | Unlimited (runs locally) |
| Upstash Redis | 10k commands/day |
