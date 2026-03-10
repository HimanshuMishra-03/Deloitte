"""
File parser: PDF (pdfplumber) and DOCX (python-docx) → clean legal text.
"""
from __future__ import annotations

import io
import re


def parse_file(file_bytes: bytes, mime_type: str) -> str:
    """
    Parse a PDF or DOCX buffer and return cleaned legal text.
    Raises ValueError for unsupported mime types.
    """
    if mime_type == "application/pdf":
        raw = _parse_pdf(file_bytes)
    elif mime_type in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    ):
        raw = _parse_docx(file_bytes)
    else:
        raise ValueError(f"Unsupported file type: {mime_type}")

    return clean_legal_text(raw)


def _parse_pdf(file_bytes: bytes) -> str:
    import pdfplumber  # lazy import — large optional dep

    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text(x_tolerance=2, y_tolerance=3)
            if page_text:
                text_parts.append(page_text)
    return "\n\n".join(text_parts)


def _parse_docx(file_bytes: bytes) -> str:
    from docx import Document  # lazy import

    doc = Document(io.BytesIO(file_bytes))
    paragraphs = [para.text for para in doc.paragraphs if para.text.strip()]
    return "\n\n".join(paragraphs)


def clean_legal_text(raw: str) -> str:
    """
    Normalise whitespace, form-feeds, and repeated blank lines.
    Called EXACTLY ONCE before any agent receives the text.
    """
    # Form-feeds → newline
    text = raw.replace("\f", "\n")
    # Carriage returns
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Multiple spaces/tabs → single space
    text = re.sub(r"[ \t]{2,}", " ", text)
    # Trailing spaces per line
    text = re.sub(r" +$", "", text, flags=re.MULTILINE)
    # Leading spaces per line (preserve indentation intent but collapse)
    text = re.sub(r"^ +", "", text, flags=re.MULTILINE)
    # More than 2 consecutive blank lines → 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
