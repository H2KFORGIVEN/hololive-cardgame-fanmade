"""One-off: discover @hololive_OCG tweet IDs from known sources, filter by
date range, categorize, and save back into x_posts.json + rebuild x_feed.json.

Usage:
  uv run python scripts/discover-recent-x.py 2026-04-01 2026-04-20
"""
import json
import sys
import time
from pathlib import Path

import httpx
from bs4 import BeautifulSoup  # noqa: F401  (imported inside scraper modules)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from scraper.scrape_x import (  # noqa: E402
    _discover_from_official, _discover_from_aggregators, _classify_tweet,
    _fetch_tweet, _build_feed_entry, build_x_feed,
    TARGET_ACCOUNT, REQUEST_DELAY,
)


def main():
    if len(sys.argv) < 3:
        print("usage: discover-recent-x.py YYYY-MM-DD YYYY-MM-DD")
        sys.exit(1)
    date_from, date_to = sys.argv[1], sys.argv[2]
    print(f"Window: {date_from} .. {date_to}\n")

    x_posts_path = ROOT / "x_posts.json"
    existing = json.loads(x_posts_path.read_text(encoding="utf-8"))
    known_ids = set()
    for url in existing.get("tournament_posts", []) + existing.get("usage_rate_posts", []) + existing.get("news_posts", []):
        import re
        m = re.search(r"/status/(\d+)", url)
        if m:
            known_ids.add(m.group(1))
    print(f"Already tracked: {len(known_ids)} tweet IDs")

    # Discovery
    client = httpx.Client()
    try:
        print("\nCrawling official site...")
        off_ids = _discover_from_official(client)
        print(f"  -> {len(off_ids)} tweet ID(s)")
        print("\nCrawling aggregator blogs...")
        agg_ids = _discover_from_aggregators(client)
        print(f"  -> {len(agg_ids)} tweet ID(s)")
    finally:
        client.close()

    all_ids = off_ids | agg_ids
    new_ids = sorted(all_ids - known_ids, key=int)  # newer numeric IDs are usually newer tweets
    print(f"\nDiscovered {len(all_ids)} unique IDs total, {len(new_ids)} new\n")

    # Fetch + filter by date
    in_window: list[tuple[str, dict, str]] = []  # (tweet_id, tweet, category)
    stale = 0
    fetch_fail = 0
    for tid in new_ids:
        tweet = _fetch_tweet(tid)
        time.sleep(REQUEST_DELAY)
        if not tweet:
            fetch_fail += 1
            continue
        created = (tweet.get("created_at") or "")[:10]
        if not created:
            continue
        if created < date_from or created > date_to:
            stale += 1
            continue
        cat = _classify_tweet(tweet) or "news"
        text_preview = (tweet.get("text") or "").replace("\n", " ")[:80]
        print(f"  {created} [{cat:10}] {tid}  {text_preview}")
        in_window.append((tid, tweet, cat))

    print(f"\n--- Summary ---")
    print(f"  In window: {len(in_window)}")
    print(f"  Out of window: {stale}")
    print(f"  Fetch failures: {fetch_fail}")

    if not in_window:
        print("\nNo new tweets in that window. Done.")
        return

    # Save URLs into x_posts.json by category
    by_cat: dict[str, list[str]] = {}
    for tid, tweet, cat in in_window:
        url = f"https://x.com/{TARGET_ACCOUNT}/status/{tid}"
        by_cat.setdefault(cat, []).append(url)

    for cat, urls in by_cat.items():
        key = f"{cat}_posts"
        existing.setdefault(key, [])
        for u in urls:
            if u not in existing[key]:
                existing[key].append(u)
        print(f"  Added {len(urls)} URL(s) to {key}")

    x_posts_path.write_text(
        json.dumps(existing, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"\nUpdated {x_posts_path}")

    # Rebuild full feed (includes new + existing)
    print("\nRebuilding x_feed.json...")
    web_data = ROOT / "web" / "data"
    build_x_feed(x_posts_path, web_data)
    # Also mirror to data/ (where scraper/run.py copies from)
    data_dir = ROOT / "data"
    data_dir.mkdir(exist_ok=True)
    (data_dir / "x_feed.json").write_text(
        (web_data / "x_feed.json").read_text(encoding="utf-8"),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
