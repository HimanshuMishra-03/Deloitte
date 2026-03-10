"""
scripts/download_models.py
Run ONCE to download all offline models (~3.4 GB total).
After running, set TRANSFORMERS_OFFLINE=1 in .env.
"""
import os
os.environ["TRANSFORMERS_OFFLINE"] = "0"

print("1/4  Downloading embedding model (all-mpnet-base-v2, ~420 MB)...")
from sentence_transformers import SentenceTransformer
SentenceTransformer("sentence-transformers/all-mpnet-base-v2")
print("     Done.")

print("2/4  Downloading Phi-3-mini-4k-instruct LLM (~2.2 GB)...")
from huggingface_hub import snapshot_download
snapshot_download("microsoft/Phi-3-mini-4k-instruct")
print("     Done.")

print("3/4  Downloading Whisper small STT (~461 MB)...")
import whisper
whisper.load_model("small")
print("     Done.")

print("4/4  Downloading Kokoro TTS (~330 MB)...")
from kokoro import KPipeline
KPipeline(lang_code="a")
print("     Done.")

print()
print("All models downloaded. Add these to backend/.env:")
print("  TRANSFORMERS_OFFLINE=1")
print("  HF_DATASETS_OFFLINE=1")
print("  RAG_LLM_MODEL=microsoft/Phi-3-mini-4k-instruct")
print("  WHISPER_MODEL=small")
