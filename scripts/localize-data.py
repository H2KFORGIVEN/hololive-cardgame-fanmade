"""Rewrite image URLs in all JSON data files to use local image paths."""

from __future__ import annotations

import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "web" / "data"
IMAGES_DIR = PROJECT_ROOT / "web" / "images" / "cards"

# CDN patterns to detect and rewrite
GITHUB_CDN = "hololive-cardgame.github.io/cards/"
STRATEGY_CDN = "holocardstrategy.jp/"
OFFICIAL_EN_CDN = "en.hololive-official-cardgame.com/wp-content/images/cardlist/"

_local_files: set[str] | None = None


def _get_local_files() -> set[str]:
    global _local_files
    if _local_files is None:
        if IMAGES_DIR.exists():
            _local_files = {f.name for f in IMAGES_DIR.iterdir() if f.suffix.lower() == ".png"}
        else:
            _local_files = set()
    return _local_files


def _localize_github_url(url: str) -> str:
    """Rewrite GitHub CDN URL to local path."""
    if not url or GITHUB_CDN not in url:
        return url
    basename = url.split("/")[-1]
    if basename in _get_local_files():
        return f"images/cards/{basename}"
    return url  # fallback to CDN


def _localize_official_en_url(url: str) -> str:
    """Rewrite official EN CDN URL, stripping EN_ prefix."""
    if not url or OFFICIAL_EN_CDN not in url:
        return url
    basename = url.split("/")[-1]
    # Strip EN_ prefix
    stripped = re.sub(r"^EN_", "", basename)
    if stripped in _get_local_files():
        return f"images/cards/{stripped}"
    return url  # fallback to CDN


def _localize_strategy_card_url(url: str) -> str:
    """Try to resolve holocardstrategy.jp card image URLs to local files."""
    if not url or STRATEGY_CDN not in url:
        return url
    basename = url.split("/")[-1]
    # Strategy URLs sometimes have the same filename as local files
    if basename in _get_local_files():
        return f"images/cards/{basename}"
    return url  # keep external URL


def _process_cards_json():
    """Localize cards.json image refs.

    Rule: NEVER overwrite `imageUrl` — it must stay as the remote CDN URL so
    deployments without local card images (Studio host, fresh clones) can fall
    back to remote. Only `image` is set to a local web path when the file exists.
    Frontend priority is `image || imageUrl` (see CardDatabase.getCardImage).
    """
    path = DATA_DIR / "cards.json"
    if not path.exists():
        return
    cards = json.loads(path.read_text(encoding="utf-8"))
    local_count = 0
    for card in cards:
        old_img = card.get("image", "")
        if old_img and "/" in old_img:
            basename = old_img.split("/")[-1]
            if basename in _get_local_files():
                card["image"] = f"images/cards/{basename}"
                local_count += 1
            # If not local, leave `image` as the raw relative path — frontend will
            # fall through to the remote `imageUrl` instead.

    path.write_text(json.dumps(cards, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"cards.json: {local_count}/{len(cards)} image paths localized (imageUrl preserved as remote fallback)")


def _process_decks_json():
    path = DATA_DIR / "decks.json"
    if not path.exists():
        return
    decks = json.loads(path.read_text(encoding="utf-8"))
    changed = 0
    for deck in decks:
        # deck_image stays external (holocardstrategy.jp screenshots)
        for card in deck.get("cards", []):
            old = card.get("image", "")
            if GITHUB_CDN in old:
                new = _localize_github_url(old)
            elif STRATEGY_CDN in old:
                new = _localize_strategy_card_url(old)
            else:
                continue
            if new != old:
                card["image"] = new
                changed += 1

    path.write_text(json.dumps(decks, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"decks.json: {changed} card images localized")


def _process_all_guides_json():
    path = DATA_DIR / "all_guides.json"
    if not path.exists():
        return
    guides = json.loads(path.read_text(encoding="utf-8"))
    changed = 0
    for guide in guides:
        for card in guide.get("cards", []):
            old = card.get("image", "")
            if GITHUB_CDN in old:
                new = _localize_github_url(old)
            elif STRATEGY_CDN in old:
                new = _localize_strategy_card_url(old)
            else:
                continue
            if new != old:
                card["image"] = new
                changed += 1

    path.write_text(json.dumps(guides, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"all_guides.json: {changed} card images localized")


def _process_decklog_json():
    path = DATA_DIR / "decklog_decks.json"
    if not path.exists():
        return
    decks = json.loads(path.read_text(encoding="utf-8"))
    changed = 0
    for deck in decks:
        for section in ("oshi_cards", "main_deck", "cheer_deck"):
            for card in deck.get(section, []):
                old = card.get("imageUrl", "")
                new = _localize_github_url(old)
                if new != old:
                    card["imageUrl"] = new
                    changed += 1

    path.write_text(json.dumps(decks, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"decklog_decks.json: {changed} imageUrls localized")


def _process_official_json():
    path = DATA_DIR / "official_decks.json"
    if not path.exists():
        return
    decks = json.loads(path.read_text(encoding="utf-8"))
    changed = 0
    for deck in decks:
        # oshi_image
        old = deck.get("oshi_image", "")
        new = _localize_official_en_url(old)
        if new != old:
            deck["oshi_image"] = new
            changed += 1

        # main_deck, cheer_deck, key_cards
        for section in ("main_deck", "cheer_deck", "key_cards"):
            for card in deck.get(section, []):
                old = card.get("imageUrl", "")
                new = _localize_official_en_url(old)
                if new != old:
                    card["imageUrl"] = new
                    changed += 1

    path.write_text(json.dumps(decks, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"official_decks.json: {changed} imageUrls localized")


def main():
    local_count = len(_get_local_files())
    print(f"Local images available: {local_count}")

    _process_cards_json()
    _process_decks_json()
    _process_all_guides_json()
    _process_decklog_json()
    _process_official_json()

    print("Done! All image URLs localized where possible.")


if __name__ == "__main__":
    main()
