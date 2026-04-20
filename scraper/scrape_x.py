"""Scrape tournament results from @hololive_OCG tweets via Twitter syndication API.

Supports proactive tweet discovery by crawling:
  - Official hololive card game website (news / event reports)
  - Known aggregator blogs that embed @hololive_OCG tweets
"""

import re
import json
import sys
import time
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

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

    Returns a dict with 'tournament_posts' and 'usage_rate_posts' URL lists,
    merged with any existing manual entries from x_posts.json.
    """
    existing: dict = {"account": TARGET_ACCOUNT, "tournament_posts": [], "usage_rate_posts": []}
    if x_posts_path.exists():
        existing = json.loads(x_posts_path.read_text(encoding="utf-8"))

    known_ids: set[str] = set()
    for url in existing.get("tournament_posts", []) + existing.get("usage_rate_posts", []):
        tid = re.search(r"/status/(\d+)", url)
        if tid:
            known_ids.add(tid.group(1))

    print("  Discovering tweets from official website...")
    client = httpx.Client()
    try:
        official_ids = _discover_from_official(client)
        print(f"    Found {len(official_ids)} tweet ID(s) from official site")

        print("  Discovering tweets from aggregator blogs...")
        agg_ids = _discover_from_aggregators(client)
        print(f"    Found {len(agg_ids)} tweet ID(s) from aggregators")

        new_ids = (official_ids | agg_ids) - known_ids
        if not new_ids:
            print("  No new tweet IDs discovered")
            return existing

        print(f"  Classifying {len(new_ids)} new tweet(s)...")
        new_tournament = []
        new_usage = []
        for tid in sorted(new_ids):
            tweet = _fetch_tweet(tid)
            if not tweet:
                continue
            category = _classify_tweet(tweet)
            tweet_url = f"https://x.com/{TARGET_ACCOUNT}/status/{tid}"
            if category == "tournament":
                new_tournament.append(tweet_url)
                print(f"    + tournament: {tweet_url}")
            elif category == "usage_rate":
                new_usage.append(tweet_url)
                print(f"    + usage_rate: {tweet_url}")
            time.sleep(REQUEST_DELAY)

        if new_tournament or new_usage:
            existing["tournament_posts"] = existing.get("tournament_posts", []) + new_tournament
            existing["usage_rate_posts"] = existing.get("usage_rate_posts", []) + new_usage
            x_posts_path.write_text(
                json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"  Updated x_posts.json: +{len(new_tournament)} tournament, +{len(new_usage)} usage rate")
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
    out_path.write_text(json.dumps(all_entries, ensure_ascii=False, indent=2), encoding="utf-8")
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


def build_x_feed(x_posts_path: Path, output_dir: Path) -> list[dict]:
    """Fetch every tweet listed in x_posts.json and save a viewer-friendly feed
    to output_dir/x_feed.json. Newest first. Skips tweets that 404 / get
    rate-limited — we keep whatever we can get this run.
    """
    if not x_posts_path.exists():
        print("  [x_feed] x_posts.json not found, skipping")
        return []
    posts = json.loads(x_posts_path.read_text(encoding="utf-8"))

    categories = [
        ("tournament", posts.get("tournament_posts", [])),
        ("usage_rate", posts.get("usage_rate_posts", [])),
    ]

    # Load previous feed so we can preserve tweets that fail to fetch this run
    # (network blip, X hiccup). We only replace entries we successfully refresh.
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
    for category, urls in categories:
        for url in urls:
            tweet_id = _extract_tweet_id(url)
            if not tweet_id or tweet_id in seen_ids:
                continue
            seen_ids.add(tweet_id)
            print(f"  [x_feed:{category}] {tweet_id}")
            tweet = _fetch_tweet(tweet_id)
            if tweet:
                entries.append(_build_feed_entry(tweet, url, category))
            elif tweet_id in existing_by_id:
                # fall back to last known snapshot
                print(f"    (using cached copy)")
                entries.append(existing_by_id[tweet_id])
            time.sleep(REQUEST_DELAY)

    # Newest first
    entries.sort(key=lambda e: e.get("created_at", ""), reverse=True)

    output_dir.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  [x_feed] Saved {len(entries)} entries to {out_path}")
    return entries


if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent
    # Run `python -m scraper.scrape_x` to rebuild x_feed.json on demand
    import sys as _sys
    if len(_sys.argv) > 1 and _sys.argv[1] == "feed":
        build_x_feed(base / "x_posts.json", base / "data")
    else:
        scrape_x_posts(
            base / "x_posts.json",
            base / "deck_codes.json",
            base / "data",
        )
