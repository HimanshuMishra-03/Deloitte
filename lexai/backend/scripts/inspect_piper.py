import asyncio
import os
import sys

# Ensure backend directory is in sys.path
backend_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from agents.voice_agent import _get_tts

async def test_inspect():
    print("Inspecting Piper synthesize output...")
    try:
        tts = _get_tts()
        text = "Test"
        for chunk in tts.synthesize(text):
            print(f"Type: {type(chunk)}")
            print(f"Attributes: {dir(chunk)}")
            # Try to find where the audio data is
            if hasattr(chunk, 'audio'):
                print(f"Has 'audio', type: {type(chunk.audio)}")
            if hasattr(chunk, 'audio_int16_bytes'):
                print(f"Has 'audio_int16_bytes', type: {type(chunk.audio_int16_bytes)}")
            break
    except Exception as e:
        print(f"❌ Inspection Failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_inspect())
