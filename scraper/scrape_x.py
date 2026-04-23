"""Scrape tournament results from @hololive_OCG tweets via Twitter syndication API.

Supports proactive tweet discovery by crawling:
  - Official hololive card game website (news / event reports)
  - Known aggregator blogs that embed @hololive_OCG tweets
"""

import os
import re
import json
import sys
import time
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

from scraper._atomic import atomic_write_json

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SYNDICATION_URL = "https://cdn.syndication.twimg.com/tweet-result"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; HoloCardMeta/1.0)"}
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9,ja;q=0.8",
}
REQUEST_DELAY = 1.0

OFFICIAL_NEWS_URL = "https://hololive-official-cardgame.com/news/"
OFFICIAL_EVENT_NEWS_URL = "https://hololive-official-cardgame.com/cat_news/event/"
OFFICIAL_BASE = "https://hololive-official-cardgame.com"

AGGREGATOR_URLS = [
    "https://vanholo.doorblog.jp/",
    "https://www.torecataru.com/?p=441",
]

TARGET_ACCOUNT = "hololive_OCG"
TWEET_URL_RE = re.compile(
    r"(?:https?://)?(?:twitter\.com|x\.com)/hololive_OCG/status/(\d+)"
)

DECKLOG_RE = re.compile(r"decklog\.bushiroad\.com/view/([A-Za-z0-9]+)")
OSHI_RE = re.compile(r"推しホロメン[：:](.+?)[\n\r]")
PLAYER_RE = re.compile(r"[：:][\[【](.+?)[\]】]\s*選手")
EVENT_RE = re.compile(r"【\s*(.+?)\s*】")
BLOCK_RE = re.compile(r"([A-Z]ブロック)")
PLACEMENT_RE = re.compile(r"(優勝|準優勝|1st|2nd|3rd)")
TEAM_RE = re.compile(r"(?:優勝|🏆)[\s　]*[\[【](.+?)[\]】][\s　]*(?:🏆)?")
POSITION_LABELS = {"先鋒": "先鋒", "中堅": "中堅", "大将": "大将"}


def _safe_get(client: httpx.Client, url: str) -> str | None:
    try:
        resp = client.get(url, headers=BROWSER_HEADERS, timeout=20, follow_redirects=True)
        if resp.status_code == 200:
            return resp.text
    except Exception as e:
        print(f"    [WARN] Failed to fetch {url}: {e}")
    return None


def _extract_tweet_ids_from_html(html: str) -> set[str]:
    """Find all @hololive_OCG tweet IDs embedded in an HTML page."""
    return set(TWEET_URL_RE.findall(html))


def _discover_from_official(client: httpx.Client) -> set[str]:
    """Crawl official website news/event pages for embedded tweet links."""
    discovered: set[str] = set()

    for list_url in [OFFICIAL_NEWS_URL, OFFICIAL_EVENT_NEWS_URL]:
        html = _safe_get(client, list_url)
        if not html:
            continue
        discovered |= _extract_tweet_ids_from_html(html)

        soup = BeautifulSoup(html, "lxml")
        for a in soup.select("a[href]"):
            href = a["href"]
            if "/news/post/" in href or "/events/post/" in href:
                full = href if href.startswith("http") else OFFICIAL_BASE + href
                page_html = _safe_get(client, full)
                if page_html:
                    discovered |= _extract_tweet_ids_from_html(page_html)
                time.sleep(0.5)

    return discovered


def _discover_from_aggregators(client: httpx.Client) -> set[str]:
    """Crawl known aggregator blogs for embedded @hololive_OCG tweets."""
    discovered: set[str] = set()
    for url in AGGREGATOR_URLS:
        html = _safe_get(client, url)
        if not html:
            continue
        discovered |= _extract_tweet_ids_from_html(html)

        soup = BeautifulSoup(html, "lxml")
        for a in soup.select("a[href]"):
            href = a["href"]
            if "hololive" in href.lower() and ("doorblog" in href or "torecataru" in href):
                page_html = _safe_get(client, href)
                if page_html:
                    discovered |= _extract_tweet_ids_from_html(page_html)
                time.sleep(0.5)

    return discovered


def _classify_tweet(tweet: dict) -> str | None:
    """Determine if a tweet is a tournament result, usage rate, or irrelevant."""
    text = tweet.get("text", "")
    entities_urls = tweet.get("entities", {}).get("urls", [])
    has_decklog = any(
        "decklog.bushiroad.com" in u.get("expanded_url", "")
        for u in entities_urls
    )
    if has_decklog or "デッキコード" in text or "デッキログ" in text:
        return "tournament"
    if "使用率" in text:
        return "usage_rate"
    if "大会結果" in text or "入賞" in text:
        return "tournament"
    return None


def discover_tweets(x_posts_path: Path) -> dict:
    """Proactively discover @hololive_OCG tweet IDs from multiple sources.

    Priority order:
      1. X API v2 timeline (if X_BEARER_TOKEN is set) — covers everything
         the account posted recently. ~1 read ≈ $0.001.
      2. Official hololive-official-cardgame.com news / event pages.
      3. Aggregator blogs (vanholo, torecataru).

    Returns a dict with 'tournament_posts', 'usage_rate_posts' and
    'news_posts' URL lists, merged with any existing manual entries.
    """
    existing: dict = {"account": TARGET_ACCOUNT, "tournament_posts": [], "usage_rate_posts": [], "news_posts": []}
    if x_posts_path.exists():
        existing = json.loads(x_posts_path.read_text(encoding="utf-8"))
    existing.setdefault("news_posts", [])

    known_ids: set[str] = set()
    for url in (existing.get("tournament_posts", [])
                + existing.get("usage_rate_posts", [])
                + existing.get("news_posts", [])):
        tid = re.search(r"/status/(\d+)", url)
        if tid:
            known_ids.add(tid.group(1))

    # ── X API discovery (preferred path) ───────────────────────────────
    # Incremental by default: x_api.discover_tweet_urls() resolves since_id
    # from state file → x_posts.json → x_feed.json (fallback chain) so we
    # NEVER re-pull tweets we already have. If all sources are empty and no
    # X_BOOTSTRAP=1 opt-in, it aborts rather than re-seed.
    api_ids: set[str] = set()
    try:
        from scraper.x_api import discover_tweet_urls, load_bearer_token
        if load_bearer_token():
            api_urls = discover_tweet_urls(TARGET_ACCOUNT)
            for u in api_urls:
                m = re.search(r"/status/(\d+)", u)
                if m:
                    api_ids.add(m.group(1))
    except Exception as e:
        print(f"  [x_api] discovery failed, will fall back to web crawlers: {e}")

    print("  Discovering tweets from official website...")
    client = httpx.Client()
    try:
        official_ids = _discover_from_official(client)
        print(f"    Found {len(official_ids)} tweet ID(s) from official site")

        print("  Discovering tweets from aggregator blogs...")
        agg_ids = _discover_from_aggregators(client)
        print(f"    Found {len(agg_ids)} tweet ID(s) from aggregators")

        new_ids = (api_ids | official_ids | agg_ids) - known_ids
        if not new_ids:
            print("  No new tweet IDs discovered")
            return existing

        print(f"  Classifying {len(new_ids)} new tweet(s)...")
        new_tournament = []
        new_usage = []
        new_news = []
        for tid in sorted(new_ids):
            tweet = _fetch_tweet(tid)
            if not tweet:
                continue
            category = _classify_tweet(tweet) or "news"
            tweet_url = f"https://x.com/{TARGET_ACCOUNT}/status/{tid}"
            if category == "tournament":
                new_tournament.append(tweet_url)
                print(f"    + tournament: {tweet_url}")
            elif category == "usage_rate":
                new_usage.append(tweet_url)
                print(f"    + usage_rate: {tweet_url}")
            else:
                new_news.append(tweet_url)
                print(f"    + news:       {tweet_url}")
            time.sleep(REQUEST_DELAY)

        if new_tournament or new_usage or new_news:
            existing["tournament_posts"] = existing.get("tournament_posts", []) + new_tournament
            existing["usage_rate_posts"] = existing.get("usage_rate_posts", []) + new_usage
            existing["news_posts"] = existing.get("news_posts", []) + new_news
            atomic_write_json(x_posts_path, existing)
            print(f"  Updated x_posts.json: +{len(new_tournament)} tournament, +{len(new_usage)} usage rate, +{len(new_news)} news")
        return existing
    finally:
        client.close()


def _extract_tweet_id(url: str) -> str | None:
    m = re.search(r"/status/(\d+)", url)
    return m.group(1) if m else None


def _fetch_tweet(tweet_id: str) -> dict | None:
    try:
        resp = httpx.get(
            SYNDICATION_URL,
            params={"id": tweet_id, "token": "0"},
            headers=HEADERS,
            timeout=30,
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        print(f"  [WARN] Failed to fetch tweet {tweet_id}: {e}")
    return None


def _parse_decklog_codes(tweet: dict) -> list[dict]:
    """Extract deck log codes from tweet entities."""
    codes = []
    for url_ent in tweet.get("entities", {}).get("urls", []):
        expanded = url_ent.get("expanded_url", "")
        m = DECKLOG_RE.search(expanded)
        if m:
            codes.append({"code": m.group(1), "url": expanded})
    return codes


def _expand_text(tweet: dict) -> str:
    """Replace t.co URLs in tweet text with their expanded versions."""
    text = tweet.get("text", "")
    for url_ent in tweet.get("entities", {}).get("urls", []):
        short = url_ent.get("url", "")
        expanded = url_ent.get("expanded_url", "")
        if short and expanded:
            text = text.replace(short, expanded)
    return text


def _parse_tournament_info(tweet: dict) -> dict:
    """Extract event/block/team info from tweet text."""
    text = _expand_text(tweet)

    event_m = EVENT_RE.search(text)
    event_raw = event_m.group(1) if event_m else ""

    block_m = BLOCK_RE.search(text)
    block = block_m.group(1) if block_m else ""

    team_m = TEAM_RE.search(text)
    team = team_m.group(1) if team_m else ""

    is_trio = "トリオ" in text
    is_note = "note_tweet" in tweet

    players = []
    segments = re.split(r"(先鋒|中堅|大将)", text)
    for i, seg in enumerate(segments):
        if seg in POSITION_LABELS and i + 1 < len(segments):
            info_text = segments[i + 1]
            player_m = PLAYER_RE.search("：" + info_text) or re.search(r"[\[【](.+?)[\]】]", info_text)
            oshi_m = OSHI_RE.search(info_text)
            dl_m = DECKLOG_RE.search(info_text)
            players.append({
                "position": seg,
                "player": player_m.group(1) if player_m else "",
                "oshi": oshi_m.group(1).strip() if oshi_m else "",
                "code": dl_m.group(1) if dl_m else "",
            })

    return {
        "event_raw": event_raw,
        "block": block,
        "team": team,
        "is_trio": is_trio,
        "is_note_tweet": is_note,
        "players": players,
    }


def _infer_event_and_date(event_raw: str, tweet: dict) -> tuple[str, str]:
    """Normalize event name and extract date from tweet."""
    created = tweet.get("created_at", "")
    date = created[:10] if created else ""

    event = event_raw.strip()
    if "ぐるっとツアー" in event:
        location = ""
        if "宮城" in event:
            location = "Miyagi"
        elif "愛知" in event:
            location = "Aichi"
        elif "東京" in event:
            location = "Tokyo"
        elif "大阪" in event:
            location = "Osaka"
        elif "福岡" in event:
            location = "Fukuoka"
        else:
            m = re.search(r"in\s+(\S+)", event)
            location = m.group(1) if m else event

        year_m = re.search(r"(\d{4})", event)
        year = year_m.group(1) if year_m else ""
        if year:
            event = f"ぐるっとツアー{year} {location}"
        else:
            event = f"ぐるっとツアー {location}"
    elif "WGP" in event or "ワールドグランプリ" in event:
        pass

    return event, date


def _build_deck_entries(tweet_url: str, tweet: dict, info: dict) -> list[dict]:
    """Build deck_codes.json-compatible entries from parsed tweet data."""
    event, date = _infer_event_and_date(info["event_raw"], tweet)
    decklog_codes = _parse_decklog_codes(tweet)
    code_set = {c["code"] for c in decklog_codes}

    entries = []
    for p in info["players"]:
        if not p["code"] and not p["oshi"]:
            continue
        block_str = f" {info['block']}" if info["block"] else ""
        placement = f"Trio 1st{block_str} ({info['team']})" if info["is_trio"] else f"1st{block_str}"

        entry = {
            "code": p["code"],
            "title": f"{p['oshi']}単" if p["oshi"] else "",
            "oshi": p["oshi"],
            "source": event,
            "event": event,
            "event_date": date,
            "placement": placement,
            "x_url": tweet_url,
        }
        if p["code"]:
            code_set.discard(p["code"])
        entries.append(entry)

    for leftover in decklog_codes:
        if leftover["code"] in code_set:
            entries.append({
                "code": leftover["code"],
                "title": "",
                "oshi": "",
                "source": event,
                "event": event,
                "event_date": date,
                "placement": "",
                "x_url": tweet_url,
            })

    return entries


def scrape_x_posts(x_posts_path: Path, deck_codes_path: Path, output_dir: Path) -> list[dict]:
    """Scrape tournament data from X posts, with proactive tweet discovery."""
    x_posts = discover_tweets(x_posts_path)

    urls = x_posts.get("tournament_posts", [])
    if not urls:
        print("  No tournament post URLs found")
        return []

    existing_codes = set()
    if deck_codes_path.exists():
        existing = json.loads(deck_codes_path.read_text(encoding="utf-8"))
        existing_codes = {e["code"] for e in existing if e.get("code")}

    all_entries = []
    for url in urls:
        tweet_id = _extract_tweet_id(url)
        if not tweet_id:
            print(f"  [WARN] Could not extract tweet ID from: {url}")
            continue

        print(f"  Fetching tweet {tweet_id}...")
        tweet = _fetch_tweet(tweet_id)
        if not tweet:
            continue

        info = _parse_tournament_info(tweet)
        entries = _build_deck_entries(url, tweet, info)

        new_count = 0
        for e in entries:
            if e.get("code") and e["code"] not in existing_codes:
                new_count += 1
                existing_codes.add(e["code"])
            all_entries.append(e)

        is_truncated = info["is_note_tweet"]
        print(f"    Event: {info['event_raw']}")
        print(f"    Team: {info['team']} | Players: {len(info['players'])} | Codes: {len(_parse_decklog_codes(tweet))}")
        if is_truncated:
            print(f"    [NOTE] Tweet is truncated (note tweet) - some deck codes may be missing")
        if new_count:
            print(f"    {new_count} new deck code(s) found")

        time.sleep(REQUEST_DELAY)

    out_path = output_dir / "x_decks.json"
    atomic_write_json(out_path, all_entries)
    print(f"  Saved {len(all_entries)} entries from X posts to {out_path}")
    return all_entries


# ─── Feed builder (for the "官方 X 消息" news page) ───────────────────────────
# Different from scrape_x_posts(): that builds deck_codes entries. This builds
# a viewer-facing snapshot of each tweet (text + media + author + date) so the
# frontend can render a news feed without calling X at all.


def _build_feed_entry(tweet: dict, url: str, category: str) -> dict:
    """Extract a minimal, renderable snapshot of a tweet for the news feed."""
    user = tweet.get("user") or {}

    media = []
    for m in tweet.get("mediaDetails") or []:
        mtype = m.get("type", "photo")
        orig = m.get("original_info") or {}
        entry = {
            "type": mtype,
            "url": m.get("media_url_https") or m.get("media_url") or "",
            "width": orig.get("width"),
            "height": orig.get("height"),
        }
        # Video/gif: prefer the highest-bitrate mp4 variant
        if mtype in ("video", "animated_gif"):
            vinfo = m.get("video_info") or {}
            mp4s = [v for v in (vinfo.get("variants") or []) if v.get("content_type") == "video/mp4"]
            if mp4s:
                best = max(mp4s, key=lambda v: v.get("bitrate") or 0)
                entry["video_url"] = best.get("url", "")
                entry["poster"] = m.get("media_url_https") or ""
        media.append(entry)

    entities = tweet.get("entities") or {}
    hashtags = [h.get("text") for h in (entities.get("hashtags") or []) if h.get("text")]

    external = []
    for u in entities.get("urls") or []:
        expanded = u.get("expanded_url") or u.get("url") or ""
        if not expanded:
            continue
        if "x.com" in expanded or "twitter.com" in expanded:
            continue
        external.append({
            "url": expanded,
            "display": u.get("display_url") or expanded,
        })

    return {
        "id": tweet.get("id_str") or str(tweet.get("id") or ""),
        "url": url,
        "text": _expand_text(tweet),
        "created_at": tweet.get("created_at", ""),
        "author": {
            "name": user.get("name", ""),
            "handle": user.get("screen_name", ""),
            "avatar": user.get("profile_image_url_https", ""),
        },
        "media": media,
        "hashtags": hashtags,
        "external_urls": external,
        "category": category,
        "favorite_count": tweet.get("favorite_count", 0),
    }


def build_x_feed(x_posts_path: Path, output_dir: Path, *, refresh_all: bool = False) -> list[dict]:
    """Incrementally build the viewer feed from x_posts.json.

    Default behavior (refresh_all=False):
      • Re-use every tweet already in x_feed.json as-is; only the `category`
        field is refreshed from the x_posts.json categorization.
      • Only fetch NEW tweet IDs (ones missing from x_feed.json) via the
        free syndication CDN.
      • Result: one syndication call per new tweet, zero for unchanged
        ones — fastest possible run and no wasted bandwidth.

    Pass refresh_all=True (or `os.environ["X_FEED_REFRESH"]="1"`) to force
    re-fetch every entry — useful if the rendering shape has changed and
    you need to regenerate media URLs / favorite_counts.

    Tweets that fail to fetch keep their previous snapshot so transient
    errors don't wipe entries.
    """
    if not x_posts_path.exists():
        print("  [x_feed] x_posts.json not found, skipping")
        return []
    posts = json.loads(x_posts_path.read_text(encoding="utf-8"))

    if os.environ.get("X_FEED_REFRESH") == "1":
        refresh_all = True

    categories = [
        ("tournament", posts.get("tournament_posts", [])),
        ("usage_rate", posts.get("usage_rate_posts", [])),
        ("news", posts.get("news_posts", [])),
    ]

    # Load previous feed — both to preserve on fetch failure and (in the
    # incremental path) to skip re-fetching everything.
    existing_by_id: dict[str, dict] = {}
    out_path = output_dir / "x_feed.json"
    if out_path.exists():
        try:
            for e in json.loads(out_path.read_text(encoding="utf-8")):
                if e.get("id"):
                    existing_by_id[e["id"]] = e
        except Exception:
            pass

    seen_ids: set[str] = set()
    entries: list[dict] = []
    new_fetches = 0
    reused = 0
    for category, urls in categories:
        for url in urls:
            tweet_id = _extract_tweet_id(url)
            if not tweet_id or tweet_id in seen_ids:
                continue
            seen_ids.add(tweet_id)

            if not refresh_all and tweet_id in existing_by_id:
                # Fast path — keep the old snapshot, just refresh the
                # category in case it was re-classified.
                existing = dict(existing_by_id[tweet_id])
                existing["category"] = category
                entries.append(existing)
                reused += 1
                continue

            print(f"  [x_feed:{category}] fetching {tweet_id}")
            tweet = _fetch_tweet(tweet_id)
            if tweet:
                entries.append(_build_feed_entry(tweet, url, category))
                new_fetches += 1
                time.sleep(REQUEST_DELAY)  # rate-limit only when we actually fetched
            elif tweet_id in existing_by_id:
                entries.append(existing_by_id[tweet_id])
                print(f"    (using cached copy)")

    # Newest first
    entries.sort(key=lambda e: e.get("created_at", ""), reverse=True)

    atomic_write_json(out_path, entries)
    print(f"  [x_feed] {len(entries)} entries total ({new_fetches} newly fetched, {reused} reused)")
    return entries


if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent
    import sys as _sys

    cmd = _sys.argv[1] if len(_sys.argv) > 1 else ""

    if cmd == "feed":
        # Rebuild feed only. Writes to data/ (for run.py pipeline that copies to web/data/).
        build_x_feed(base / "x_posts.json", base / "data")

    elif cmd == "daily":
        # Daily cron mode: incremental X API discovery (since_id) + feed rebuild
        # straight into web/data/. Does NOT re-process tournament URLs for deck
        # codes — that's scrape_x_posts' job and isn't needed for feed refresh.
        # In steady state (no new tweets): 0 X API reads, 0 syndication fetches.
        discover_tweets(base / "x_posts.json")
        build_x_feed(base / "x_posts.json", base / "web" / "data")

    else:
        # Full path: discover + re-extract deck codes from tournament tweets.
        scrape_x_posts(
            base / "x_posts.json",
            base / "deck_codes.json",
            base / "data",
        )
