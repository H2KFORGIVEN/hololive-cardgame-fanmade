"""Download cards.json from the hololive-cardgame GitHub repository."""

import json
import time
from pathlib import Path

import httpx

MAX_RETRIES = 3
RETRY_DELAY = 10

CARDS_JSON_URL = "https://raw.githubusercontent.com/hololive-cardgame/cards/main/cards.json"
CARD_IMAGE_BASE = "https://hololive-cardgame.github.io/cards/"


def fetch_cards(output_dir: Path) -> list[dict]:
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "cards.json"

    for attempt in range(MAX_RETRIES):
        resp = httpx.get(CARDS_JSON_URL, timeout=60, follow_redirects=True)
        if resp.status_code == 429 and attempt < MAX_RETRIES - 1:
            print(f"[fetch_cards] Rate limited, retrying in {RETRY_DELAY}s... ({attempt + 1}/{MAX_RETRIES})")
            time.sleep(RETRY_DELAY)
            continue
        resp.raise_for_status()
        break
    cards = resp.json()

    for card in cards:
        if "image" in card and card["image"]:
            card["imageUrl"] = CARD_IMAGE_BASE + card["image"]

    output_path.write_text(json.dumps(cards, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[fetch_cards] Saved {len(cards)} cards to {output_path}")
    return cards


if __name__ == "__main__":
    fetch_cards(Path(__file__).resolve().parent.parent / "data")
