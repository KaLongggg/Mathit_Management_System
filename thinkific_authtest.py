"""Probe which auth scheme the Thinkific credential uses. Read-only."""
import os, requests
from dotenv import load_dotenv
load_dotenv()

KEY = os.getenv("THINKIFIC_API_KEY", "").strip()
SUB = os.getenv("THINKIFIC_SUBDOMAIN", "").strip()
BASE = os.getenv("THINKIFIC_BASE_URL", "https://api.thinkific.com/api/public/v1").strip()

schemes = {
    "A: X-Auth-API-Key + X-Auth-Subdomain": {"X-Auth-API-Key": KEY, "X-Auth-Subdomain": SUB},
    "B: Bearer + X-Auth-Subdomain":         {"Authorization": f"Bearer {KEY}", "X-Auth-Subdomain": SUB},
    "C: Bearer only":                        {"Authorization": f"Bearer {KEY}"},
}

for name, headers in schemes.items():
    headers["Content-Type"] = "application/json"
    try:
        r = requests.get(f"{BASE}/courses", headers=headers, params={"limit": 1}, timeout=20)
        print(f"[{name}] -> HTTP {r.status_code}  {r.text[:160]}")
    except Exception as e:
        print(f"[{name}] -> ERROR {e}")
