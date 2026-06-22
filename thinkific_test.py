"""Read-only connectivity test for the Thinkific Admin API.
Confirms auth works and prints the real shape of Users / Courses / Enrollments.
Does NOT write anything anywhere.
"""
import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("THINKIFIC_API_KEY", "").strip()
SUBDOMAIN = os.getenv("THINKIFIC_SUBDOMAIN", "").strip()
BASE_URL = os.getenv("THINKIFIC_BASE_URL", "https://api.thinkific.com/api/public/v1").strip()

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "X-Auth-Subdomain": SUBDOMAIN,
    "Content-Type": "application/json",
}


def check_config():
    print(f"Base URL   : {BASE_URL}")
    print(f"Subdomain  : {SUBDOMAIN or '(MISSING)'}")
    print(f"API key    : {'set (' + str(len(API_KEY)) + ' chars)' if API_KEY else '(MISSING)'}")
    print("-" * 60)
    if not API_KEY or not SUBDOMAIN:
        raise SystemExit("Missing THINKIFIC_API_KEY or THINKIFIC_SUBDOMAIN in .env")


def probe(path, label):
    url = f"{BASE_URL}{path}"
    print(f"\n### {label}: GET {path}")
    try:
        r = requests.get(url, headers=HEADERS, params={"limit": 1, "page": 1}, timeout=20)
    except Exception as e:
        print(f"  REQUEST FAILED: {e}")
        return
    print(f"  HTTP {r.status_code}")
    if r.status_code != 200:
        print(f"  Body: {r.text[:500]}")
        return
    body = r.json()
    meta = body.get("meta", {}).get("pagination", {})
    items = body.get("items", [])
    print(f"  total_items={meta.get('total_items')}  total_pages={meta.get('total_pages')}")
    if items:
        sample = items[0]
        print(f"  sample fields: {sorted(sample.keys())}")
        # show a redacted-ish sample (truncate long values)
        preview = {k: (str(v)[:40] if v is not None else None) for k, v in sample.items()}
        print("  first item preview:")
        print(json.dumps(preview, indent=4, default=str))
    else:
        print("  (no items returned)")


if __name__ == "__main__":
    check_config()
    probe("/users", "USERS")
    probe("/courses", "COURSES")
    probe("/enrollments", "ENROLLMENTS")
