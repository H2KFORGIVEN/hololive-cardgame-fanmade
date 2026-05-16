"""Deduplicate and copy local card images into web/images/cards/."""

import json
import shutil
from pathlib import Path

SOURCE_DIR = Path.home() / ".openclaw/workspace-iroha/downloads/hololive-official-cardgame-cardlist"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
TARGET_DIR = PROJECT_ROOT / "web" / "images" / "cards"
WEB_DATA_DIR = PROJECT_ROOT / "web" / "data"


def main():
    manifest_path = SOURCE_DIR / "manifest.json"
    if not manifest_path.exists():
        print(f"ERROR: manifest not found at {manifest_path}")
        return

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    items = manifest.get("items", [])
    print(f"Found {len(items)} products in manifest")

    # Collect all images: filename -> source path
    # Process entry cup / compilation sets first, then expansion-specific sets.
    # Later writes win, so expansion-specific sources take priority over compilations.
    entry_items = [it for it in items if it["expansion"].startswith("ent")]
    other_items = [it for it in items if not it["expansion"].startswith("ent")]

    image_map: dict[str, Path] = {}
    total_files = 0

    for item in entry_items + other_items:
        item_dir = Path(item["dir"])
        if not item_dir.exists():
            print(f"  WARN: directory not found: {item_dir}")
            continue
        for filename in item["images"]:
            src = item_dir / filename
            if src.exists():
                image_map[filename] = src
                total_files += 1

    unique_count = len(image_map)
    dup_count = total_files - unique_count
    print(f"Total image references: {total_files}")
    print(f"Unique images: {unique_count}")
    print(f"Duplicates removed: {dup_count}")

    # Copy images
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    copied = 0
    for filename, src_path in sorted(image_map.items()):
        dst = TARGET_DIR / filename
        if not dst.exists() or dst.stat().st_size != src_path.stat().st_size:
            shutil.copy2(src_path, dst)
            copied += 1

    print(f"Copied {copied} new/updated images to {TARGET_DIR}")
    print(f"Skipped {unique_count - copied} already up-to-date images")

    # Copy manifest to web/data/
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(manifest_path, WEB_DATA_DIR / "manifest.json")
    print(f"Copied manifest.json to {WEB_DATA_DIR}")

    # Report total size
    total_bytes = sum(f.stat().st_size for f in TARGET_DIR.iterdir() if f.is_file())
    print(f"Total image directory size: {total_bytes / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
