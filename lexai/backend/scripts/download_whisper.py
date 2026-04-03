"""
Dedicated Whisper model downloader with basic retry logic.
"""
import whisper
import time
import urllib.error

MODEL_NAME = "small"

def download():
    print(f"Attempting to download Whisper '{MODEL_NAME}' model...")
    for i in range(3):
        try:
            whisper.load_model(MODEL_NAME)
            print("✓ Whisper model ready.")
            return True
        except (urllib.error.URLError, ConnectionResetError) as e:
            print(f"⚠ Attempt {i+1} failed: {e}")
            if i < 2:
                print("Retrying in 5 seconds...")
                time.sleep(5)
            else:
                print("❌ Max retries reached.")
    return False

if __name__ == "__main__":
    download()
