"""scripts/download_qwen.py — download Qwen2.5-3B GGUF once"""
from huggingface_hub import hf_hub_download
import os

os.makedirs("models", exist_ok=True)

print("Downloading Qwen2.5-3B-Instruct Q4_K_M GGUF (1.9GB)...")
path = hf_hub_download(
    repo_id="Qwen/Qwen2.5-3B-Instruct-GGUF",
    filename="qwen2.5-3b-instruct-q4_k_m.gguf",
    local_dir="models",
)
print(f"✓ Model saved to: {path}")
print("\nAdd to .env:")
print("  CHATBOT_MODEL_PATH=models/qwen2.5-3b-instruct-q4_k_m.gguf")
