"""Fetch deck lists from Deck Log via the hocg-deck-convert proxy API."""

import json
import sys
import time
from pathlib import Path

import httpx

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API_URL = "https://hocg-deck-convert-api.onrender.com/view-deck"
CARD_IMAGE_BASE = "https://hololive-cardgame.github.io/cards/cardListImages/"
REQUEST_DELAY = 1.0


def _fetch_deck(code: str) -> dict | None:
    try:
        resp = httpx.post(
            API_URL,
            json={"game_title_id": 108, "code": code.lower()},
            timeout=30,
        )
        if resp.status_code != 200:
            resp2 = httpx.post(
                API_URL,
                json={"game_title_id": 9, "code": code.lower()},
                timeout=30,
            )
            if resp2.status_code != 200:
                print(f"  [warn] Failed to fetch {code}: {resp.status_code}")
                return None
            return resp2.json()
        return resp.json()
    except Exception as e:
        print(f"  [warn] Error fetching {code}: {e}")
        return None


def _build_card_list(raw_cards: list[dict], cards_db: dict) -> list[dict]:
    results = []
    for entry in raw_cards:
        card_number = entry.get("card_number", "")
        count = entry.get("num", 1)
        card_info = cards_db.get(card_number, {})
        results.append({
            "card_id": card_number,
            "count": count,
            "name": card_info.get("name", card_number),
            "type": card_info.get("type", ""),
            "color": card_info.get("color", ""),
            "imageUrl": card_info.get("imageUrl", ""),
        })
    return results


def scrape_decklog(deck_codes_path: Path, cards_path: Path, output_dir: Path) -> list[dict]:
    if not deck_codes_path.exists():
        print("[decklog] deck_codes.json not found, skipping")
        return []

    codes = json.loads(deck_codes_path.read_text(encoding="utf-8"))

    cards_db = {}
    if cards_path.exists():
        raw_cards = json.loads(cards_path.read_text(encoding="utf-8"))
        for c in raw_cards:
            cards_db[c["id"]] = c

    results = []
    for i, entry in enumerate(codes):
        code = entry["code"]
        print(f"  [{i+1}/{len(codes)}] Fetching deck code: {code}")

        raw = _fetch_deck(code)
        if not raw:
            continue

        oshi_list = _build_card_list(raw.get("p_list", []), cards_db)
        main_deck = _build_card_list(raw.get("list", []), cards_db)
        cheer_deck = _build_card_list(raw.get("sub_list", []), cards_db)

        deck = {
            "deck_id": f"decklog-{code}",
            "deck_code": code,
            "title": entry.get("title") or raw.get("title", code),
            "oshi": entry.get("oshi", ""),
            "source": "decklog",
            "event": entry.get("event"),
            "event_date": entry.get("event_date"),
            "placement": entry.get("placement"),
            "url": f"https://decklog-en.bushiroad.com/ja/view/{raw.get('deck_id', code)}",
            "oshi_cards": oshi_list,
            "main_deck": main_deck,
            "cheer_deck": cheer_deck,
            "main_deck_count": sum(c["count"] for c in main_deck),
            "cheer_deck_count": sum(c["count"] for c in cheer_deck),
        }
        results.append(deck)
        time.sleep(REQUEST_DELAY)

    output_path = output_dir / "decklog_decks.json"
    output_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[decklog] Saved {len(results)} decks to {output_path}")
    return results


if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent
    scrape_decklog(
        base / "deck_codes.json",
        base / "data" / "cards.json",
        base / "data",
    )
