"""Download cards.json from the hololive-cardgame GitHub repository."""

import json
from pathlib import Path

import httpx

CARDS_JSON_URL = "https://raw.githubusercontent.com/hololive-cardgame/cards/main/cards.json"
CARD_IMAGE_BASE = "https://hololive-cardgame.github.io/cards/"


def fetch_cards(output_dir: Path) -> list[dict]:
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "cards.json"

    resp = httpx.get(CARDS_JSON_URL, timeout=60, follow_redirects=True)
    resp.raise_for_status()
    cards = resp.json()

    for card in cards:
        if "image" in card and card["image"]:
            card["imageUrl"] = CARD_IMAGE_BASE + card["image"]

    output_path.write_text(json.dumps(cards, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[fetch_cards] Saved {len(cards)} cards to {output_path}")
    return cards


if __name__ == "__main__":
    fetch_cards(Path(__file__).resolve().parent.parent / "data")
