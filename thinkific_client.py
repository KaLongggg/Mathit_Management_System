"""Reusable Thinkific Admin API client.

Auth: OAuth/Bearer token (this store uses `Authorization: Bearer <token>`).
Handles pagination (meta.pagination) and 429 rate-limit backoff.
Read-only helpers — no writes.
"""
import os
import time
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


def _get(path, params=None, max_retries=5):
    """GET one page with 429 backoff. Returns parsed JSON."""
    url = f"{BASE_URL}{path}"
    attempt = 0
    while True:
        r = requests.get(url, headers=HEADERS, params=params or {}, timeout=30)
        if r.status_code == 429 and attempt < max_retries:
            wait = int(r.headers.get("Retry-After", 2 ** attempt))
            print(f"  429 rate-limited; sleeping {wait}s")
            time.sleep(wait)
            attempt += 1
            continue
        r.raise_for_status()
        return r.json()


def get_all(path, limit=250, params=None):
    """Generator over all items across pages for a list endpoint."""
    page = 1
    params = dict(params or {})
    while True:
        params.update({"page": page, "limit": limit})
        body = _get(path, params)
        items = body.get("items", [])
        for it in items:
            yield it
        pag = body.get("meta", {}).get("pagination", {})
        nxt = pag.get("next_page")
        if not nxt:
            break
        page = nxt


def count(path):
    """Total item count for a list endpoint (cheap 1-item probe)."""
    body = _get(path, {"page": 1, "limit": 1})
    return body.get("meta", {}).get("pagination", {}).get("total_items")
