"""
services/chunker.py — Text chunking for RAG indexing.

Splits raw judgment text into overlapping word-based chunks and annotates
each chunk with a best-guess section label (facts / arguments / reasoning /
decision) using simple keyword regex matching.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class Chunk:
    text: str
    chunk_index: int
    char_start: int
    char_end: int
    section_hint: str


_SECTION_PATTERNS = {
    "facts":     r'\b(facts?|background|brief facts|history of the case)\b',
    "arguments": r'\b(arguments?|contentions?|submissions?|counsel argued)\b',
    "reasoning": r'\b(held|held that|analysis|ratio|the court|we find|it is clear)\b',
    "decision":  r'\b(order|ordered|allowed|dismissed|set aside|disposed)\b',
}


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> list[Chunk]:
    """
    Split *text* into overlapping word-based chunks.

    Args:
        chunk_size: target number of words per chunk.
        overlap:    number of words shared between consecutive chunks.

    Returns:
        List of Chunk objects (empty list if text is too short).
    """
    words = text.split()
    chunks: list[Chunk] = []
    step = max(1, chunk_size - overlap)

    for i in range(0, len(words), step):
        chunk_words = words[i : i + chunk_size]
        if len(chunk_words) < 50:
            break  # skip tiny tail chunks

        chunk_text_str = " ".join(chunk_words)
        section = "unknown"
        lower = chunk_text_str.lower()
        for sec, pattern in _SECTION_PATTERNS.items():
            if re.search(pattern, lower):
                section = sec
                break

        chunks.append(
            Chunk(
                text=chunk_text_str,
                chunk_index=len(chunks),
                char_start=i * 6,           # approximate (avg word len ~6)
                char_end=(i + len(chunk_words)) * 6,
                section_hint=section,
            )
        )

    return chunks
