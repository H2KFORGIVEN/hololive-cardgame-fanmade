"""Enrich cards.json with metadata from manifest and local image variants."""

import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CARDS_PATH = PROJECT_ROOT / "web" / "data" / "cards.json"
MANIFEST_PATH = PROJECT_ROOT / "web" / "data" / "manifest.json"
IMAGES_DIR = PROJECT_ROOT / "web" / "images" / "cards"


def _base_card_id(filename: str) -> str:
    """Extract the base card ID from a filename like hBP01-046_C.png -> hBP01-046."""
    name = filename.rsplit(".", 1)[0]  # remove .png
    # Pattern: {expansion}-{number}_{rarity} or {expansion}-{number}_{variant}_{rarity}
    m = re.match(r"^((?:h\w+|ent\d+)-\d+)", name)
    return m.group(1) if m else name


def main():
    if not CARDS_PATH.exists():
        print(f"ERROR: cards.json not found at {CARDS_PATH}")
        return
    if not MANIFEST_PATH.exists():
        print(f"ERROR: manifest.json not found at {MANIFEST_PATH}")
        return

    cards = json.loads(CARDS_PATH.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    # Build filename -> product metadata lookup
    file_to_product: dict[str, dict] = {}
    for item in manifest.get("items", []):
        meta = {
            "expansion": item["expansion"],
            "product": item["name"],
            "year": item["year"],
        }
        for img in item["images"]:
            # Prefer expansion-specific products over entry cup compilations
            if img not in file_to_product or not item["expansion"].startswith("ent"):
                file_to_product[img] = meta

    # Build card_id -> list of available local image filenames
    local_images: dict[str, list[str]] = {}
    if IMAGES_DIR.exists():
        for f in sorted(IMAGES_DIR.iterdir()):
            if f.suffix.lower() == ".png":
                cid = _base_card_id(f.name)
                local_images.setdefault(cid, []).append(f.name)

    # Enrich each card
    enriched = 0
    for card in cards:
        card_id = card.get("id", "")

        # Get the image filename from the card's current image field
        img_field = card.get("image", "")
        basename = img_field.split("/")[-1] if img_field else ""

        # Add product metadata
        product_meta = file_to_product.get(basename)
        if product_meta:
            card["expansion"] = product_meta["expansion"]
            card["productName"] = product_meta["product"]
            card["year"] = product_meta["year"]
            enriched += 1

        # Add all local image variants for this card ID
        variants = local_images.get(card_id, [])
        if variants:
            card["allImages"] = [f"images/cards/{v}" for v in variants]

    CARDS_PATH.write_text(
        json.dumps(cards, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Enriched {enriched}/{len(cards)} cards with product metadata")
    print(f"Cards with local image variants: {sum(1 for c in cards if c.get('allImages'))}")


if __name__ == "__main__":
    main()
