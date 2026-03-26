import json
import sys
import time
from pathlib import Path

from deep_translator import GoogleTranslator

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SOURCE_LANG = "ja"
TARGET_LANGS = ["zh-TW", "en", "fr"]
LANG_CODE_MAP = {"zh-TW": "zh-TW", "en": "en", "fr": "fr"}
REQUEST_DELAY = 0.3


def _translate_batch(texts: list[str], target: str) -> list[str]:
    """Translate a batch of strings. Returns original on failure."""
    if not texts:
        return []
    translator = GoogleTranslator(source=SOURCE_LANG, target=LANG_CODE_MAP[target])
    results = []
    for text in texts:
        if not text or not text.strip():
            results.append(text)
            continue
        try:
            results.append(translator.translate(text))
            time.sleep(REQUEST_DELAY)
        except Exception as e:
            print(f"  [warn] translate failed for '{text[:40]}...' -> {target}: {e}")
            results.append(text)
    return results


def _translate_field(value, target: str):
    """Translate a string or list of strings."""
    if isinstance(value, list):
        return _translate_batch(value, target)
    if isinstance(value, str) and value.strip():
        result = _translate_batch([value], target)
        return result[0] if result else value
    return value


def _make_multilang(original, targets_dict: dict):
    """Build {ja: original, en: ..., zh-TW: ..., fr: ...} dict."""
    out = {"ja": original}
    for lang, translated in targets_dict.items():
        out[lang] = translated
    return out


def translate_tier_list(data_dir: Path):
    tier_path = data_dir / "tier_list.json"
    if not tier_path.exists():
        print("[translate] tier_list.json not found, skipping")
        return

    tier_data = json.loads(tier_path.read_text(encoding="utf-8"))

    for tier in tier_data.get("tiers", []):
        for deck in tier.get("decks", []):
            if isinstance(deck.get("features"), list) and deck["features"]:
                translations = {}
                for lang in TARGET_LANGS:
                    print(f"  Translating features '{deck.get('name', '?')}' -> {lang}")
                    translations[lang] = _translate_field(deck["features"], lang)
                deck["features"] = _make_multilang(deck["features"], translations)

            if isinstance(deck.get("description"), str) and deck["description"]:
                translations = {}
                for lang in TARGET_LANGS:
                    translations[lang] = _translate_field(deck["description"], lang)
                deck["description"] = _make_multilang(deck["description"], translations)

    tier_path.write_text(json.dumps(tier_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print("[translate] tier_list.json translated")


def translate_decks(data_dir: Path):
    decks_path = data_dir / "decks.json"
    if not decks_path.exists():
        print("[translate] decks.json not found, skipping")
        return

    decks = json.loads(decks_path.read_text(encoding="utf-8"))

    for deck in decks:
        deck_name = deck.get("deck_id", "?")

        if isinstance(deck.get("description"), str) and deck["description"]:
            translations = {}
            for lang in TARGET_LANGS:
                translations[lang] = _translate_field(deck["description"], lang)
            deck["description"] = _make_multilang(deck["description"], translations)

        for card in deck.get("cards", []):
            if isinstance(card.get("role"), str) and card["role"]:
                translations = {}
                for lang in TARGET_LANGS:
                    translations[lang] = _translate_field(card["role"], lang)
                card["role"] = _make_multilang(card["role"], translations)

        for step in deck.get("strategy", []):
            if isinstance(step.get("title"), str) and step["title"]:
                translations = {}
                for lang in TARGET_LANGS:
                    translations[lang] = _translate_field(step["title"], lang)
                step["title"] = _make_multilang(step["title"], translations)

            if isinstance(step.get("text"), str) and step["text"]:
                translations = {}
                for lang in TARGET_LANGS:
                    print(f"  Translating strategy '{deck_name}' -> {lang}")
                    translations[lang] = _translate_field(step["text"], lang)
                step["text"] = _make_multilang(step["text"], translations)

    decks_path.write_text(json.dumps(decks, ensure_ascii=False, indent=2), encoding="utf-8")
    print("[translate] decks.json translated")


def translate_all(data_dir: Path):
    print("[translate] Translating tier_list.json...")
    translate_tier_list(data_dir)
    print("[translate] Translating decks.json...")
    translate_decks(data_dir)
    print("[translate] All translations complete")


if __name__ == "__main__":
    translate_all(Path(__file__).resolve().parent.parent / "data")
