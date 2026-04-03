"""
services/hardcoded_answers.py
─────────────────────────────
Instant answers for questions about LexAI itself.
No LLM call. No Qdrant search. Returns in milliseconds.

Two layers:
  1. EXACT — keyword match → fixed detailed answer
  2. IMPROVISED — live data (case count, quota, avg confidence)
"""
from __future__ import annotations

# ── Answer bank ────────────────────────────────────────────────────────────────
# Each entry: ( [trigger phrases], answer_markdown )

_BANK: list[tuple[list[str], str]] = [

    (["how do i upload", "upload a case", "how to upload", "upload pdf",
      "add a case", "add a judgment"],
     """Here's how to upload a judgment! 📂

**Step 1** — Click the **Upload PDF** button in the top-right navbar (or drag-and-drop onto the dashboard upload zone).
**Step 2** — LexAI accepts PDFs up to 200 pages and 50MB.
**Step 3** — The file is queued instantly — you'll see it appear in the **Processing Queue** card with a live progress bar.

Once uploaded, the 4-agent pipeline runs automatically. You don't need to do anything else! 😊"""),

    (["how does processing work", "what happens after upload",
      "pipeline", "how are cases processed", "4 agent", "four agent",
      "what does lexai do with the pdf"],
     """Once you upload a judgment, LexAI runs a **4-agent AI pipeline** 🤖

**Agent 1 — Extraction** (~40s)
Reads the full PDF and extracts 9 structured fields: case title, court, parties, main issue, arguments, precedents, reasoning, and final order.

**Agent 2 — Validation** (~35s)
Cross-checks every extracted field against the source document. Confidence scores are assigned. Flags uncertain fields and re-extracts if needed.

**Agent 3 — Headnote** (~12s)
Generates an SCC-format headnote, practice area tags, and keywords — the kind you'd see in a law journal.

**Agent 4 — Search Indexing** (~3s)
Chunks the verbatim judgment text into 300-word segments and indexes them in Qdrant using MiniLM embeddings. This is what powers semantic search and my answers!

**Total: ~90–130 seconds** per document. Watch the progress bar move through each stage in real time 📊"""),

    (["quota", "api limit", "how many calls", "free tier",
      "remaining calls", "api calls today", "gemini limit"],
     """Great question about the quota! 📊

LexAI uses **Gemini 1.5 Flash** for document processing:

| Metric | Value |
|---|---|
| Free tier limit | 1,500 requests/day |
| Per document (clean) | ~3 Gemini calls |
| Per document (with re-extraction) | ~4 Gemini calls |
| Estimated docs/day | **~375–490 documents** |

Your live quota ring on the **Analytics page** shows exact usage with a countdown to midnight UTC reset.

The chatbot (that's me! 👋) runs on **Qwen2.5-3b locally** — completely offline, zero API cost."""),

    (["confidence", "confidence score", "what does confidence mean",
      "accuracy", "what is confidence", "confidence percentage"],
     """The confidence score shows how accurately I extracted each section of the judgment 🎯

**Scoring bands:**
- 🟢 **85–100%** — High confidence. Extraction is very likely correct.
- 🟡 **70–84%** — Medium. Worth a quick spot-check.
- 🔴 **Below 70%** — Low. Document may be scanned, unclear, or non-standard.

Each of the **7 sections** (Facts, Petitioner Arguments, Respondent Arguments, Sections of Law, Precedents, Court Reasoning, Final Order) gets its own score.

The **overall confidence** is a weighted average across all sections. You can see per-section rings on the **Analytics page** and individual scores on each case's detail page."""),

    (["how does search work", "semantic search", "how to search",
      "search cases", "vector search", "how do you search"],
     """The Search page uses **semantic search** — it understands the *meaning* of your query, not just exact keywords 🔍

**How it works:**
1. Your query → 384-dimensional vector (MiniLM embedding model)
2. Qdrant vector DB finds most semantically similar chunks across all your indexed cases
3. Results ranked by cosine similarity score

**Tips for better results:**
- Natural language works best: *"property rights after partition"* > *"property partition"*
- Use the **outcome filter pills** (Allowed / Dismissed / Remanded) to narrow results
- Each result shows a similarity score and excerpt from the judgment

The same embedding model is used at index time AND search time — so the vector spaces always match ✅"""),

    (["analytics", "analytics page", "what is shown", "charts", "graphs",
      "quota ring", "section confidence", "weekly usage"],
     """The **Analytics page** is your command center for understanding LexAI's performance 📈

**What you'll find:**

🔵 **Quota Gauge Ring** — Live API calls used today vs your limit, with hours until midnight reset.

📊 **Section Confidence Mini-Rings** — One ring per section (Facts, Arguments, Reasoning, etc.) showing average extraction accuracy across all your cases.

⚡ **Calls Per Document Breakdown** — Exact split of which agent used how many Gemini calls.

📅 **7-Day Usage Chart** — Bar chart of daily API usage, colour-coded red when you're approaching the limit.

🔢 **Summary Stats** — Total cases processed, average overall confidence, today's quota remaining."""),

    (["how do you work", "what can you do", "who are you",
      "tell me about yourself", "what can the chatbot",
      "are you ai", "how does the chatbot", "what is lexi"],
     """Hi! I'm **Lexi**, LexAI's AI legal research assistant 👩‍⚖️

Here's what I can help you with:

📂 **On the Dashboard** — Ask me about any legal topic. I'll search across ALL your uploaded judgments to find relevant information.

📄 **On a Case Page** — I pre-load that judgment's context when the page opens, so I can answer questions about it almost instantly.

📊 **About LexAI** — Ask me how the pipeline works, what confidence scores mean, how the quota works — anything about the system!

🔍 **Cross-case analysis** — *"What sections of law appear most in all my cases?"* I'll search across every indexed judgment!

I run entirely **offline on your machine** using Qwen2.5-3b — your conversations are completely private 🔒"""),

    (["rag", "how does chatbot find", "how do you find answers",
      "vector database", "qdrant", "minilm", "embedding model"],
     """Here's exactly how I find answers for you 🔍

**Step 1 — Your question is embedded**
It's converted to a 384-dimensional vector using the **MiniLM-L6-v2** model (the same model used when indexing your documents — so the vector spaces always match).

**Step 2 — Qdrant search**
Our vector database finds the most semantically similar text chunks from your indexed judgments.

**Step 3 — Context assembly**
The top 3 most relevant chunks are assembled into a prompt.

**Step 4 — Local LLM generation**
**Qwen2.5-3b-Instruct** (running 100% locally, zero API cost) generates my answer from those chunks.

**Special case — Case pages:**
When you open a case page, I pre-load all that case's chunks into memory. Your first question searches the in-memory cache instead of Qdrant — much faster! ⚡"""),

    (["processing time", "how long does it take", "how long to process",
      "when will my case be ready", "how long upload"],
     """Processing time depends on document length, but here's what to expect ⏱️

| Stage | Time |
|---|---|
| Agent 1 — Extraction | ~35–45 seconds |
| Agent 2 — Validation | ~30–40 seconds |
| Agent 3 — Headnote | ~10–15 seconds |
| Agent 4 — Indexing | ~2–5 seconds |
| **Total (typical)** | **~80–110 seconds** |

For a 200-page Supreme Court judgment, expect around **90 seconds**. You can watch the live progress bar on the dashboard — it updates in real time as each agent finishes!

If validation flags uncertain fields, Agent 2b may re-extract, adding ~40 more seconds."""),
]


def get_exact(question: str) -> str | None:
    """Return hardcoded answer if question matches a trigger. None otherwise."""
    q = question.lower().strip()
    for triggers, answer in _BANK:
        if any(t in q for t in triggers):
            return answer
    return None


def get_improvised(question: str, ctx: dict) -> str | None:
    """
    Build a contextual answer from live analytics data.
    ctx keys: total_cases, avg_confidence, quota_used, quota_limit, queue_length
    """
    q = question.lower()

    if any(w in q for w in ["how many cases", "total cases", "cases processed",
                              "cases do i have", "how many judgments"]):
        n   = ctx.get("total_cases", 0)
        msg = f"You've processed **{n} judgment{'s' if n != 1 else ''}** so far! "
        msg += "Each one went through the full 4-agent pipeline. " if n > 0 else ""
        msg += ("Head to the Dashboard to see them all 📁" if n > 0
                else "Upload your first PDF to get started — it only takes about 90 seconds! 📂")
        return msg

    if any(w in q for w in ["average confidence", "avg confidence",
                              "overall accuracy", "how accurate"]):
        avg = ctx.get("avg_confidence", 0)
        tier = ("That's excellent! 🎉" if avg >= 85
                else "Solid accuracy! 👍" if avg >= 70
                else "Some cases may have complex or unclear formatting — worth checking the low-confidence sections.")
        return f"Your average extraction confidence is **{avg}%** across all processed cases. {tier}"

    if any(w in q for w in ["quota remaining", "calls left", "how many calls left",
                              "remaining quota"]):
        used  = ctx.get("quota_used", 0)
        limit = ctx.get("quota_limit", 1490)
        left  = limit - used
        docs  = left // 4
        return (f"You've used **{used}** of your **{limit}** daily Gemini calls. "
                f"That's **{left} calls remaining** — enough to process about **{docs} more documents** today. "
                f"The quota resets at midnight UTC 🕛")

    return None
