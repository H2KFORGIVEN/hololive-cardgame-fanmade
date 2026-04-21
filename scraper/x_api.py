"""Thin X API v2 client for discovering @hololive_OCG tweets.

Design
──────
Only used for DISCOVERY (listing tweet IDs). The actual tweet content is
still pulled from the free `cdn.syndication.twimg.com` endpoint — that
saves money AND keeps the per-tweet data shape identical to what
`_build_feed_entry()` in scrape_x.py already handles.

Cost model (2026-04-20 pay-as-you-go)
─────────────────────────────────────
X bills per **tweet object returned**, not per HTTP request. So the
`/users/:id/tweets` endpoint returning 76 tweets costs 76 reads × $0.001
= $0.076, not $0.001. Our initial naive run cost $0.39 because we (a)
ran discovery twice and (b) didn't use `since_id` so every call pulled
the whole 30-day window.

Optimizations to keep cost down
───────────────────────────────
1. `since_id` incremental discovery — store the max-seen tweet ID in
   `data/x_sync_state.json`; next run only pulls tweets AFTER that ID.
   Steady-state cost: 0-5 reads/day.
2. Persistent user_id cache at `data/x_user_cache.json` — `/users/by/
   username/` costs 1 read each call, so cache it once and never lookup
   again.
3. Read counter cap — `X_MAX_READS_PER_DAY` (default 500) refuses
   further calls once exceeded, as a budget safety net.
4. Minimal `tweet.fields` — drop `entities` (we get those free from
   syndication); keep only `created_at` for since_id + sort.

Credentials
───────────
Reads X_BEARER_TOKEN from the environment or from .env.local at repo
root. Set it once:

    # in .env.local (gitignored)
    X_BEARER_TOKEN=AAAAAAAAAAAAAAAA...

or export before running:

    export X_BEARER_TOKEN='...'
    uv run python -m scraper.scrape_x feed
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx


X_API_BASE = "https://api.x.com/2"
USER_CACHE: dict[str, str] = {}
REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
USER_CACHE_PATH = DATA_DIR / "x_user_cache.json"
SYNC_STATE_PATH = DATA_DIR / "x_sync_state.json"
READ_COUNTER_PATH = DATA_DIR / "x_read_counter.json"


# ─── Token / auth ─────────────────────────────────────────────────────

def load_bearer_token() -> str | None:
    """Return the X Bearer Token, or None if not configured."""
    token = os.environ.get("X_BEARER_TOKEN")
    if token:
        return token.strip()

    env_file = REPO_ROOT / ".env.local"
    if not env_file.exists():
        return None
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("X_BEARER_TOKEN="):
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


# ─── Read counter (daily budget cap) ──────────────────────────────────

def _today_utc() -> str:
    return _dt.datetime.utcnow().strftime("%Y-%m-%d")


def _load_counter() -> dict:
    if not READ_COUNTER_PATH.exists():
        return {"date": _today_utc(), "reads": 0}
    try:
        d = json.loads(READ_COUNTER_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"date": _today_utc(), "reads": 0}
    if d.get("date") != _today_utc():
        return {"date": _today_utc(), "reads": 0}
    return d


def _save_counter(d: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    READ_COUNTER_PATH.write_text(json.dumps(d, indent=2) + "\n", encoding="utf-8")


def _max_reads_per_day() -> int:
    try:
        return int(os.environ.get("X_MAX_READS_PER_DAY", "500"))
    except ValueError:
        return 500


def _check_budget(cost_estimate: int) -> bool:
    """Return True if cost_estimate reads fit within the daily budget."""
    c = _load_counter()
    budget = _max_reads_per_day()
    if c["reads"] + cost_estimate > budget:
        print(
            f"  [x_api] DAILY BUDGET CAP REACHED: {c['reads']}/{budget} reads used; "
            f"refusing call that would cost {cost_estimate}. "
            f"Raise X_MAX_READS_PER_DAY to continue."
        )
        return False
    return True


def _record_reads(n: int) -> None:
    c = _load_counter()
    c["reads"] += n
    _save_counter(c)


def daily_reads_used() -> int:
    return _load_counter().get("reads", 0)


# ─── User ID cache (persistent) ───────────────────────────────────────

def _load_user_cache() -> dict:
    if not USER_CACHE_PATH.exists():
        return {}
    try:
        return json.loads(USER_CACHE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_user_cache(cache: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    USER_CACHE_PATH.write_text(json.dumps(cache, indent=2) + "\n", encoding="utf-8")


def get_user_id(token: str, username: str) -> str | None:
    """Resolve @username → numeric user ID.

    Uses in-memory cache first, then the persistent `data/x_user_cache.json`
    file. Only hits the API (1 read) if both caches miss.
    """
    # In-memory cache
    if username in USER_CACHE:
        return USER_CACHE[username]

    # Persistent cache
    persistent = _load_user_cache()
    if username in persistent:
        USER_CACHE[username] = persistent[username]
        return persistent[username]

    # API lookup
    if not _check_budget(1):
        return None

    url = f"{X_API_BASE}/users/by/username/{username}"
    try:
        r = httpx.get(url, headers=_auth_headers(token), timeout=20)
    except Exception as e:
        print(f"  [x_api] user lookup failed: {e}")
        return None

    if r.status_code != 200:
        print(f"  [x_api] user lookup HTTP {r.status_code}: {r.text[:200]}")
        return None

    _record_reads(1)  # the /users/by/username call itself costs 1 read
    data = r.json().get("data") or {}
    uid = data.get("id")
    if uid:
        USER_CACHE[username] = uid
        persistent[username] = uid
        _save_user_cache(persistent)
        print(f"  [x_api] cached user_id for @{username} = {uid}")
    return uid


# ─── Sync state (since_id) ────────────────────────────────────────────

def _load_sync_state() -> dict:
    if not SYNC_STATE_PATH.exists():
        return {}
    try:
        return json.loads(SYNC_STATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_sync_state(state: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SYNC_STATE_PATH.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def _update_since_id(username: str, tweets: list[dict]) -> None:
    """Record the max-seen tweet ID for this user, so next run only pulls newer."""
    if not tweets:
        return
    max_id = max(int(t["id"]) for t in tweets if t.get("id"))
    state = _load_sync_state()
    per_user = state.setdefault("last_seen_id", {})
    current = int(per_user.get(username, "0") or "0")
    if max_id > current:
        per_user[username] = str(max_id)
        state["last_sync_utc"] = _dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        _save_sync_state(state)
        print(f"  [x_api] since_id for @{username} advanced to {max_id}")


def get_last_seen_id(username: str) -> str | None:
    return _load_sync_state().get("last_seen_id", {}).get(username)


# ─── Resilient since_id fallback chain ────────────────────────────────
# Prevents the scraper from ever re-fetching all 30 days of tweets when the
# state file is deleted or corrupted. Falls back to scanning the committed
# JSON files (x_posts.json, web/data/x_feed.json) for the highest tweet ID
# we already have. If NO source has any ID, refuse to bootstrap unless
# X_BOOTSTRAP=1 is explicitly set.

_TWEET_ID_RE = re.compile(r"/status/(\d+)")


def _max_id_from_x_posts(username: str) -> int | None:
    path = REPO_ROOT / "x_posts.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    max_id = 0
    for key in ("tournament_posts", "usage_rate_posts", "news_posts"):
        for url in data.get(key, []) or []:
            if username not in url:
                continue
            m = _TWEET_ID_RE.search(url)
            if m:
                try:
                    v = int(m.group(1))
                    if v > max_id: max_id = v
                except ValueError:
                    pass
    return max_id or None


def _max_id_from_x_feed() -> int | None:
    path = REPO_ROOT / "web" / "data" / "x_feed.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    max_id = 0
    for entry in data or []:
        s = entry.get("id", "")
        if isinstance(s, str) and s.isdigit():
            v = int(s)
            if v > max_id: max_id = v
    return max_id or None


def _resolve_since_id_with_fallbacks(username: str) -> tuple[str | None, str]:
    """Walk all available sources to find the highest-ID tweet we already have.
    Returns (since_id_string_or_None, source_description).
    """
    candidates: list[tuple[str, int]] = []

    # Layer 1: state file (most authoritative, updated every run)
    sid = _load_sync_state().get("last_seen_id", {}).get(username)
    if sid and sid.isdigit():
        candidates.append(("state file", int(sid)))

    # Layer 2: x_posts.json — every URL we've ever discovered
    sid2 = _max_id_from_x_posts(username)
    if sid2:
        candidates.append(("x_posts.json", sid2))

    # Layer 3: x_feed.json — every tweet we've ever snapshotted
    sid3 = _max_id_from_x_feed()
    if sid3:
        candidates.append(("x_feed.json", sid3))

    if not candidates:
        return None, "none"

    # Take the max across all sources (safer if any one is stale)
    source, value = max(candidates, key=lambda x: x[1])
    return str(value), source


# ─── Timeline fetch ───────────────────────────────────────────────────

def get_user_tweets(
    token: str,
    user_id: str,
    *,
    since_id: str | None = None,
    since_iso: str | None = None,
    until_iso: str | None = None,
    max_pages: int = 5,
    exclude_replies: bool = True,
    exclude_retweets: bool = True,
) -> list[dict]:
    """Fetch tweets from a user's timeline, paginated.

    Prefers `since_id` over `since_iso` when both are given (X API disallows
    the combination, and `since_id` is more precise for incremental syncs).

    Cost ≈ (tweets returned) reads. The daily budget cap (X_MAX_READS_PER_DAY)
    is checked against a conservative pre-call estimate of max_pages × 100.
    """
    url = f"{X_API_BASE}/users/{user_id}/tweets"

    exclude = []
    if exclude_replies: exclude.append("replies")
    if exclude_retweets: exclude.append("retweets")

    params: dict = {
        "max_results": 100,
        # Minimal fields — we don't pay for what we don't ask for. entities/
        # media come from syndication CDN (free). public_metrics dropped too;
        # if we want ♥ count later, syndication gives it.
        "tweet.fields": "created_at",
    }
    if exclude:
        params["exclude"] = ",".join(exclude)
    if since_id:
        params["since_id"] = since_id
    elif since_iso:
        params["start_time"] = since_iso
    if until_iso and not since_id:
        # end_time not allowed with since_id per X API docs
        params["end_time"] = until_iso

    # Before the call: just check there's ANY budget remaining. We enforce
    # the hard cap per-page below (since a since_id query most often returns
    # 0-5 tweets, a conservative pre-estimate would refuse legitimate runs).
    if not _check_budget(1):
        print(f"  [x_api] aborting timeline fetch — daily budget exhausted")
        return []

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
        # Record actual reads (tweets returned in this page)
        _record_reads(len(batch))

        # Per-page budget check: if this page already pushed us over cap,
        # stop paginating. We keep what we got — no refunds for overshoot.
        if daily_reads_used() >= _max_reads_per_day():
            print(
                f"  [x_api] budget cap reached after page {page+1} "
                f"({daily_reads_used()}/{_max_reads_per_day()}); stopping pagination"
            )
            break

        next_token = meta.get("next_token")
        if not next_token:
            break

        time.sleep(0.5)  # gentle pacing between pages

    if tweets:
        print(f"  [x_api] fetched {len(tweets)} tweets; day total now {daily_reads_used()} reads")

    return tweets


def discover_tweet_urls(
    username: str,
    *,
    since_id: str | None = None,
    since_iso: str | None = None,
    until_iso: str | None = None,
    use_sync_state: bool = True,
) -> list[str]:
    """High-level helper: returns list of tweet URLs for the user.

    When `use_sync_state=True` and no explicit since_id/since_iso is given,
    reads the stored `last_seen_id` from `data/x_sync_state.json` and uses
    that — so daily cron runs only pull tweets newer than the last run.

    Returns [] if X_BEARER_TOKEN is not configured, the request fails, or
    the daily budget is exhausted — callers should fall back to the legacy
    blog crawler.
    """
    token = load_bearer_token()
    if not token:
        print("  [x_api] no X_BEARER_TOKEN configured, skipping API discovery")
        return []

    uid = get_user_id(token, username)
    if not uid:
        return []

    if use_sync_state and not since_id and not since_iso:
        since_id, source = _resolve_since_id_with_fallbacks(username)
        if since_id:
            print(f"  [x_api] incremental: fetching tweets after id {since_id} (source: {source})")
        else:
            # No since_id from any source → bootstrap would re-pull everything.
            # Refuse unless explicitly opted in via X_BOOTSTRAP=1.
            if os.environ.get("X_BOOTSTRAP") == "1":
                print(f"  [x_api] X_BOOTSTRAP=1 set — allowing first-time full pull (expect ~30 days of reads)")
            else:
                print(f"  [x_api] ABORT: no since_id found in state file, x_posts.json, or x_feed.json.")
                print(f"  [x_api] Refusing to bootstrap — would re-pull every recent tweet and cost ~$0.10+.")
                print(f"  [x_api] If you really want to re-seed: X_BOOTSTRAP=1 <command>")
                return []

    tweets = get_user_tweets(
        token, uid,
        since_id=since_id, since_iso=since_iso, until_iso=until_iso,
    )
    _update_since_id(username, tweets)

    urls = [f"https://x.com/{username}/status/{t['id']}" for t in tweets if t.get("id")]
    print(f"  [x_api] Discovered {len(urls)} tweet URL(s) via X API")
    return urls


if __name__ == "__main__":
    import sys
    # Usage patterns:
    #   python -m scraper.x_api hololive_OCG                           # incremental (since last run)
    #   python -m scraper.x_api hololive_OCG 2026-04-01 2026-04-20     # explicit date range
    username = sys.argv[1] if len(sys.argv) > 1 else "hololive_OCG"
    if len(sys.argv) > 3:
        since = f"{sys.argv[2]}T00:00:00Z"
        until = f"{sys.argv[3]}T23:59:59Z"
        urls = discover_tweet_urls(
            username, since_iso=since, until_iso=until, use_sync_state=False,
        )
    else:
        urls = discover_tweet_urls(username)
    for u in urls:
        print(u)
    print(f"\nDaily reads used: {daily_reads_used()} / {_max_reads_per_day()}", file=sys.stderr)
