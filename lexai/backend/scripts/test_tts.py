import asyncio
import os
import sys

# Ensure backend directory is in sys.path
backend_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from agents.voice_agent import synthesize

async def test():
    print("Testing Piper TTS synthesis...")
    try:
        # This will trigger the Piper model download (~67MB) on first run
        audio = await synthesize('The Supreme Court held that the appeal is allowed.')
        print(f"✓ TTS OK - {len(audio)} bytes of audio generated")
    except Exception as e:
        print(f"❌ TTS Failed with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
