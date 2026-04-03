
import asyncio
import os
import subprocess
import tempfile
import torch
from pathlib import Path
from agents.voice_agent import transcribe

async def test():
    print("--- Voice Agent Verification ---")
    ffmpeg_path = r"C:\Users\Himanshu Mishra\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin"
    os.environ["PATH"] += os.pathsep + ffmpeg_path
    
    # 1. Check ffmpeg
    try:
        res = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True)
        print(f"FFmpeg OK: {res.stdout.splitlines()[0]}")
    except Exception as e:
        print(f"FFmpeg Error: {e}")
        return

    # 2. Check Whisper with dummy audio
    dummy_wav = "dummy_verify.wav"
    print(f"Generating dummy audio to {dummy_wav}...")
    subprocess.run(["ffmpeg", "-f", "lavfi", "-i", "sine=f=440:d=1", "-y", dummy_wav], capture_output=True)
    
    if not os.path.exists(dummy_wav):
        print("Failed to generate dummy audio")
        return

    with open(dummy_wav, "rb") as f:
        audio_bytes = f.read()
    
    print(f"Transcribing {len(audio_bytes)} bytes...")
    try:
        # We expect this might return empty string for a pure sine wave or noise,
        # but it shouldn't CRASH.
        text = await transcribe(audio_bytes, fmt="wav")
        print(f"Transcription Result: '{text}'")
    except Exception as e:
        print(f"Transcription CRASHED: {e}")
    finally:
        if os.path.exists(dummy_wav):
            os.remove(dummy_wav)

if __name__ == "__main__":
    asyncio.run(test())
