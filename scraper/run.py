"""Main entry point: run all scrapers and output JSON to data/."""

import shutil
from pathlib import Path

from scraper.fetch_cards import fetch_cards
from scraper.scrape_tiers import scrape_tiers
from scraper.scrape_decks import scrape_all_decks, scrape_all_guides
from scraper.scrape_decklog import scrape_decklog
from scraper.translate import translate_all


def main():
    base = Path(__file__).resolve().parent.parent
    data_dir = base / "data"
    web_data_dir = base / "web" / "data"

    print("=" * 50)
    print("Holo Card Meta Scraper")
    print("=" * 50)

    print("\n[1/6] Fetching cards database...")
    fetch_cards(data_dir)

    print("\n[2/6] Scraping tier list...")
    scrape_tiers(data_dir)

    cards_path = data_dir / "cards.json"

    print("\n[3/6] Scraping tier-linked deck recipes...")
    tier_decks = scrape_all_decks(data_dir / "tier_list.json", data_dir, cards_path)

    print("\n[4/6] Scraping ALL deck guides from holocardstrategy...")
    existing_urls = {d["url"] for d in tier_decks if d.get("url")}
    scrape_all_guides(data_dir, existing_urls, cards_path)

    print("\n[5/6] Fetching Deck Log decks...")
    scrape_decklog(base / "deck_codes.json", data_dir / "cards.json", data_dir)

    print("\n[6/6] Translating scraped data (ja -> zh-TW, en, fr)...")
    translate_all(data_dir)

    print("\n[Copy] Copying data to web/data/ for frontend...")
    web_data_dir.mkdir(parents=True, exist_ok=True)
    for f in ["cards.json", "tier_list.json", "decks.json", "decklog_decks.json", "all_guides.json"]:
        src = data_dir / f
        if src.exists():
            shutil.copy2(src, web_data_dir / f)
            print(f"  Copied {f}")

    print("\n" + "=" * 50)
    print("Done! Open web/index.html to view the app.")
    print("=" * 50)


if __name__ == "__main__":
    main()
