import requests
import os
from pathlib import Path

def download_whisper_manual():
    url = "https://openaipublic.azureedge.net/main/whisper/models/9ecf7799724bc112c28b96863ad57bb570d72ba73ac9cdbdd2a466c6560da061/small.pt"
    target_dir = Path(os.path.expanduser("~/.cache/whisper"))
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / "small.pt"

    if target_path.exists():
        print(f"✓ Whisper model already exists at {target_path}")
        return

    print(f"Downloading Whisper 'small' model (~461 MB) to {target_path}...")
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    
    try:
        response = requests.get(url, headers=headers, stream=True, timeout=30)
        response.raise_for_status()
        
        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0
        
        with open(target_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        percent = (downloaded / total_size) * 100
                        if int(percent) % 10 == 0:
                            print(f"  Progress: {percent:.1f}%", end="\r")
        
        print("\n✓ Download complete.")
    except Exception as e:
        print(f"\n❌ Error downloading: {e}")
        # Cleanup partial file
        if target_path.exists():
            target_path.unlink()

if __name__ == "__main__":
    download_whisper_manual()
