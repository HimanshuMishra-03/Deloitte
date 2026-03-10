import os
import redis
from dotenv import load_dotenv

load_dotenv()

redis_url = os.getenv("REDIS_URL")
print(f"Connecting to: {redis_url}")

try:
    r = redis.from_url(redis_url)
    r.ping()
    print("✅ Redis connection successful!")
except Exception as e:
    print(f"❌ Redis connection failed: {e}")
