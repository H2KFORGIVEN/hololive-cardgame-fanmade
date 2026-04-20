"""Thin X API v2 client for discovering @hololive_OCG tweets.

Design
──────
Only used for DISCOVERY (listing tweet IDs in a time window). The actual
tweet content is still pulled from the free `cdn.syndication.twimg.com`
endpoint — that saves money AND keeps the per-tweet data shape identical
to what `_build_feed_entry()` in scrape_x.py already handles.

Cost (2026-04-20 pay-as-you-go pricing):
  $0.001 per read.
  Typical daily discovery run uses 1-2 reads ($0.001-0.002).
  Monthly cost: ~$0.10.

Credentials
───────────
Reads X_BEARER_TOKEN from the environment or from .env.local at repo root.
Set it once:

    # in .env.local (gitignored)
    X_BEARER_TOKEN=AAAAAAAAAAAAAAAAAAAAAMLheAAAAAAA0%2BuSeid%2B...

or export before running:

    export X_BEARER_TOKEN='...'
    uv run python -m scraper.scrape_x feed
"""
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Iterable

import httpx


X_API_BASE = "https://api.x.com/2"
USER_CACHE: dict[str, str] = {}


def load_bearer_token() -> str | None:
    """Return the X Bearer Token, or None if not configured."""
    token = os.environ.get("X_BEARER_TOKEN")
    if token:
        return token.strip()

    # Fallback: parse .env.local in repo root (two dirs up from this file)
    repo_root = Path(__file__).resolve().parent.parent
    env_file = repo_root / ".env.local"
    if not env_file.exists():
        return None
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("X_BEARER_TOKEN="):
            # Support both X_BEARER_TOKEN=abc and X_BEARER_TOKEN="abc"
            val = line.split("=", 1)[1].strip()
            if val.startswith(('"', "'")) and val.endswith(('"', "'")):
                val = val[1:-1]
            return val
    return None


def _auth_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "User-Agent": "hololive-card-meta/1.0 (scraper, fan-made non-commercial)",
    }


def get_user_id(token: str, username: str) -> str | None:
    """Resolve @username → numeric user ID (cached per process)."""
    if username in USER_CACHE:
        return USER_CACHE[username]

    url = f"{X_API_BASE}/users/by/username/{username}"
    try:
        r = httpx.get(url, headers=_auth_headers(token), timeout=20)
    except Exception as e:
        print(f"  [x_api] user lookup failed: {e}")
        return None

    if r.status_code != 200:
        print(f"  [x_api] user lookup HTTP {r.status_code}: {r.text[:200]}")
        return None

    data = r.json().get("data") or {}
    uid = data.get("id")
    if uid:
        USER_CACHE[username] = uid
    return uid


def get_user_tweets(
    token: str,
    user_id: str,
    *,
    since_iso: str | None = None,
    until_iso: str | None = None,
    max_pages: int = 5,
    exclude_replies: bool = True,
    exclude_retweets: bool = True,
) -> list[dict]:
    """Fetch tweets from a user's timeline, paginated.

    Cost ≈ `max_pages` reads (one read per 100 tweets). Default cap is 5 pages
    = 500 tweets, which is way more than we need for a single scrape cycle.

    `since_iso` / `until_iso` are RFC 3339 / ISO 8601 timestamps, e.g.
    `2026-04-01T00:00:00Z`.
    """
    url = f"{X_API_BASE}/users/{user_id}/tweets"

    exclude = []
    if exclude_replies: exclude.append("replies")
    if exclude_retweets: exclude.append("retweets")

    params = {
        "max_results": 100,
        "tweet.fields": "created_at,public_metrics,entities",
    }
    if exclude:
        params["exclude"] = ",".join(exclude)
    if since_iso:
        params["start_time"] = since_iso
    if until_iso:
        params["end_time"] = until_iso

    tweets: list[dict] = []
    next_token: str | None = None
    for page in range(max_pages):
        if next_token:
            params["pagination_token"] = next_token
        try:
            r = httpx.get(url, headers=_auth_headers(token), params=params, timeout=25)
        except Exception as e:
            print(f"  [x_api] timeline fetch failed (page {page+1}): {e}")
            break

        if r.status_code == 429:
            print("  [x_api] rate limited (HTTP 429) — stopping pagination")
            break
        if r.status_code != 200:
            print(f"  [x_api] timeline HTTP {r.status_code}: {r.text[:200]}")
            break

        body = r.json()
        batch = body.get("data") or []
        tweets.extend(batch)

        meta = body.get("meta") or {}
        next_token = meta.get("next_token")
        if not next_token:
            break

        time.sleep(0.5)  # gentle pacing between pages

    return tweets


def discover_tweet_urls(
    username: str,
    *,
    since_iso: str | None = None,
    until_iso: str | None = None,
) -> list[str]:
    """High-level helper: returns list of tweet URLs for the user in the
    given window. Returns [] if X_BEARER_TOKEN is not configured or the
    request fails — callers should fall back to the legacy blog crawler.
    """
    token = load_bearer_token()
    if not token:
        print("  [x_api] no X_BEARER_TOKEN configured, skipping API discovery")
        return []

    uid = get_user_id(token, username)
    if not uid:
        return []

    tweets = get_user_tweets(token, uid, since_iso=since_iso, until_iso=until_iso)
    urls = [f"https://x.com/{username}/status/{t['id']}" for t in tweets if t.get("id")]
    print(f"  [x_api] Discovered {len(urls)} tweet URL(s) via X API")
    return urls


if __name__ == "__main__":
    import sys
    # Usage: uv run python -m scraper.x_api hololive_OCG 2026-04-01 2026-04-20
    username = sys.argv[1] if len(sys.argv) > 1 else "hololive_OCG"
    since = f"{sys.argv[2]}T00:00:00Z" if len(sys.argv) > 2 else None
    until = f"{sys.argv[3]}T23:59:59Z" if len(sys.argv) > 3 else None
    urls = discover_tweet_urls(username, since_iso=since, until_iso=until)
    for u in urls:
        print(u)
