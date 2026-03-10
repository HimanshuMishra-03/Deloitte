from __future__ import annotations
import asyncio, io, logging, os, tempfile
from pathlib import Path

logger         = logging.getLogger(__name__)
_WHISPER_SIZE  = os.getenv("WHISPER_MODEL", "small")
_whisper_model = None
_tts_pipeline  = None


def _get_whisper():
    global _whisper_model
    if _whisper_model is None:
        import whisper
        logger.info("Loading Whisper %s...", _WHISPER_SIZE)
        _whisper_model = whisper.load_model(_WHISPER_SIZE)
    return _whisper_model


def _get_tts():
    global _tts_pipeline
    if _tts_pipeline is None:
        from kokoro import KPipeline
        logger.info("Loading Kokoro TTS...")
        _tts_pipeline = KPipeline(lang_code="a")
    return _tts_pipeline


async def transcribe(audio_bytes: bytes, fmt: str = "webm") -> str:
    import torch
    with tempfile.NamedTemporaryFile(suffix=f".{fmt}", delete=False) as tmp:
        tmp.write(audio_bytes)
        path = tmp.name
    try:
        model  = _get_whisper()
        result = await asyncio.to_thread(
            model.transcribe, path,
            language="en", fp16=torch.cuda.is_available(),
        )
        return result["text"].strip()
    finally:
        Path(path).unlink(missing_ok=True)


async def synthesize(text: str, voice: str = "af_heart") -> bytes:
    import numpy as np
    import soundfile as sf

    words = text.split()
    if len(words) > 300:
        text = " ".join(words[:300]) + "..."

    tts    = _get_tts()
    chunks = []
    for _, _, audio in tts(text, voice=voice):
        if audio is not None:
            chunks.append(audio)

    if not chunks:
        return b""

    buf = io.BytesIO()
    sf.write(buf, np.concatenate(chunks), samplerate=24000, format="WAV")
    return buf.getvalue()
