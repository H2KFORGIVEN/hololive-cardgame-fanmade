"""Main entry point: run all scrapers and output JSON to data/."""

import json
import shutil
from pathlib import Path

from scraper.fetch_cards import fetch_cards
from scraper.scrape_tiers import scrape_tiers
from scraper.scrape_decks import scrape_all_decks, scrape_all_guides
from scraper.scrape_decklog import scrape_decklog
from scraper.scrape_official import scrape_official
from scraper.scrape_rules import scrape_rules
from scraper.scrape_x import scrape_x_posts, build_x_feed
from scraper.translate import translate_all


def _assign_tier_to_guides(data_dir: Path):
    """Cross-reference guide titles against tier list to assign tier levels."""
    tier_path = data_dir / "tier_list.json"
    guides_path = data_dir / "all_guides.json"
    if not tier_path.exists() or not guides_path.exists():
        return

    tiers = json.loads(tier_path.read_text(encoding="utf-8"))
    guides = json.loads(guides_path.read_text(encoding="utf-8"))

    # Build keyword list — strict matching only. The old version added stripped
    # cores like "クロニー" (from "クロニー単") which then matched unrelated decks
    # like "ハコスクロニー" (Hakos+Kronii combo, NOT tier 1). Now we only accept
    # full vtuber names and full deck names, so a guide is tagged with a tier
    # ONLY if its title literally contains one of those strings. False positives
    # drop to ~0; some decks become untagged when the source site lists them only
    # as mono ("クロニー単") while guides use a compound name ("ハコスクロニー") —
    # that's the correct behaviour: a compound build is not the same deck.
    lookup: list[tuple[str, int]] = []
    seen_keywords: set[tuple[str, int]] = set()

    def add(keyword: str, tier_num: int):
        keyword = (keyword or "").strip()
        if len(keyword) >= 3 and (keyword, tier_num) not in seen_keywords:
            seen_keywords.add((keyword, tier_num))
            lookup.append((keyword, tier_num))

    for tier in tiers.get("tiers", []):
        tier_num = tier["tier"]
        for d in tier.get("decks", []):
            # Only match on the DECK name (e.g. "AZKi単", "ミオ推しハコリズ").
            # Skipping raw vtuber names like "AZKi" — those are generic and
            # cause false positives: a guide titled "推しAZKiそらロボ" (AZKi as
            # oshi, sora/robo as main deck) isn't the same deck as T1's "AZKi単".
            # Requiring the full deck name means a match implies "same deck".
            name = d.get("name", "")
            if name:
                add(name, tier_num)

    # Longest keywords first so specific full-name matches beat shorter ones
    lookup.sort(key=lambda x: len(x[0]), reverse=True)

    assigned = 0
    for g in guides:
        if g.get("tier"):
            continue
        title = g.get("title", "")
        if isinstance(title, dict):
            title = title.get("ja", "")
        for keyword, tier_num in lookup:
            if keyword in title:
                g["tier"] = tier_num
                assigned += 1
                break

    guides_path.write_text(json.dumps(guides, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  Assigned tier to {assigned}/{len(guides)} guides")


def main():
    base = Path(__file__).resolve().parent.parent
    data_dir = base / "data"
    web_data_dir = base / "web" / "data"

    print("=" * 50)
    print("Holo Card Meta Scraper")
    print("=" * 50)

    print("\n[1/10] Fetching cards database...")
    fetch_cards(data_dir)

    print("\n[2/10] Scraping tier list...")
    scrape_tiers(data_dir)

    cards_path = data_dir / "cards.json"

    print("\n[3/10] Scraping tier-linked deck recipes...")
    tier_decks = scrape_all_decks(data_dir / "tier_list.json", data_dir, cards_path)

    print("\n[4/10] Scraping ALL deck guides from holocardstrategy...")
    existing_urls = {d["url"] for d in tier_decks if d.get("url")}
    scrape_all_guides(data_dir, existing_urls, cards_path)

    # Guide tier assignment disabled: guide titles frequently contain the name
    # of a current tier deck while being an older version or a different build
    # (e.g. "5弾更新版！AZKi単" vs current T1 "AZKi単" at /7danazkideck-kaisetu/,
    # or "ハコスクロニー" — a Hakos+Kronii combo — vs T1 "クロニー単" mono).
    # Substring matching can't distinguish these reliably. Tier-linked decks are
    # already captured accurately in decks.json via tier_list URL matching, so
    # leave guides as "Guide"-badged without a tier label.
    print("\n[5/10] (skipped) Guide tier assignment — false-positive-prone, disabled")

    print("\n[6/10] Discovering & scraping X posts for tournament results...")
    scrape_x_posts(base / "x_posts.json", base / "deck_codes.json", data_dir)

    print("\n[6b/10] Building X feed snapshot (for the 官方X消息 page)...")
    build_x_feed(base / "x_posts.json", data_dir)

    print("\n[7/10] Fetching Deck Log decks...")
    scrape_decklog(base / "deck_codes.json", data_dir / "cards.json", data_dir)

    print("\n[8/10] Scraping official recommended decks...")
    scrape_official(data_dir)

    print("\n[9/10] Scraping official rule updates...")
    scrape_rules(data_dir)

    print("\n[10/10] Translating scraped data (ja -> zh-TW, en, fr)...")
    translate_all(data_dir)

    print("\n[Copy] Copying data to web/data/ for frontend...")
    web_data_dir.mkdir(parents=True, exist_ok=True)
    for f in ["cards.json", "tier_list.json", "decks.json", "decklog_decks.json", "all_guides.json", "official_decks.json", "rules.json", "x_feed.json"]:
        src = data_dir / f
        if src.exists():
            shutil.copy2(src, web_data_dir / f)
            print(f"  Copied {f}")

    print("\n[11/12] Enriching cards with local image metadata...")
    import subprocess, sys
    scripts_dir = base / "scripts"
    subprocess.run([sys.executable, str(scripts_dir / "enrich-cards.py")], check=True)

    print("\n[12/12] Localizing image URLs to use local files...")
    subprocess.run([sys.executable, str(scripts_dir / "localize-data.py")], check=True)

    print("\n" + "=" * 50)
    print("Done! Run 'python3 -m http.server 8080 --directory web' to view the app.")
    print("=" * 50)


if __name__ == "__main__":
    main()
