"""
agents/voice_agent.py -- Speech-to-Text (Whisper) + Text-to-Speech (Piper).

TTS backend: piper-tts (pure ONNX wheel, no C compiler / blis / spaCy needed).
STT backend: openai-whisper.

All heavy imports are LAZY -- loaded only when first called.
Configure via .env:
  WHISPER_MODEL=small
"""
from __future__ import annotations
import asyncio, io, logging, os, tempfile
from pathlib import Path

logger         = logging.getLogger(__name__)
_WHISPER_SIZE  = os.getenv("WHISPER_MODEL", "small")
_whisper_model = None
_piper_voice   = None


def _get_whisper():
    global _whisper_model
    if _whisper_model is None:
        import whisper
        logger.info("Loading Whisper %s...", _WHISPER_SIZE)
        _whisper_model = whisper.load_model(_WHISPER_SIZE)
    return _whisper_model


def _get_tts():
    """
    Load PiperVoice on first call, downloading the ONNX model (~67 MB)
    to ~/.cache/piper/ if not already present.
    """
    global _piper_voice
    if _piper_voice is None:
        import urllib.request
        from piper.voice import PiperVoice

        model_dir  = Path(os.path.expanduser("~/.cache/piper"))
        model_dir.mkdir(parents=True, exist_ok=True)
        model_path  = model_dir / "en_US-lessac-medium.onnx"
        config_path = model_dir / "en_US-lessac-medium.onnx.json"

        base = (
            "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
            "en/en_US/lessac/medium/"
        )
        if not model_path.exists():
            logger.info("Downloading Piper TTS model (~67 MB)...")
            urllib.request.urlretrieve(
                base + "en_US-lessac-medium.onnx", model_path
            )
        if not config_path.exists():
            urllib.request.urlretrieve(
                base + "en_US-lessac-medium.onnx.json", config_path
            )

        _piper_voice = PiperVoice.load(
            str(model_path), config_path=str(config_path)
        )
        logger.info("Piper TTS loaded")
    return _piper_voice


async def transcribe(audio_bytes: bytes, fmt: str = "webm") -> str:
    """
    Transcribe audio bytes to text using Whisper.

    Args:
        audio_bytes: Raw audio file bytes.
        fmt:         File extension hint (webm, mp3, wav, ogg).
    Returns:
        Transcribed text string.
    """
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


async def synthesize(text: str, voice: str = "default") -> bytes:
    """
    Synthesize text to speech using Piper TTS.

    Args:
        text:  Input text (truncated to 300 words).
        voice: Ignored (Piper model is fixed at load time).
    Returns:
        WAV audio bytes (16-bit PCM, 22050 Hz, mono).
    """
    import numpy as np
    import soundfile as sf

    words = text.split()
    if len(words) > 300:
        text = " ".join(words[:300]) + "..."

    tts    = _get_tts()
    chunks = []
    # Use simple synthesize and accumulate binary audio data
    for chunk in tts.synthesize(text):
        # chunk.audio_int16_bytes is the raw PCM bytes
        chunks.append(np.frombuffer(chunk.audio_int16_bytes, dtype=np.int16))

    if not chunks:
        return b""

    combined = np.concatenate(chunks).astype(np.float32) / 32768.0
    buf = io.BytesIO()
    sf.write(buf, combined, samplerate=22050, format="WAV")
    return buf.getvalue()
