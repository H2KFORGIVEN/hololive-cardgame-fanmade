import json
import sys
import time
from pathlib import Path

from deep_translator import GoogleTranslator

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

TARGET_LANGS_JA = ["zh-TW", "en", "fr"]
TARGET_LANGS_ZH = ["ja", "en", "fr"]
REQUEST_DELAY = 0.3

_cache: dict[str, str] = {}
_cache_path: Path | None = None
_cache_dirty = False


def _load_cache(base_dir: Path):
    global _cache, _cache_path
    _cache_path = base_dir / "translation_cache.json"
    if _cache_path.exists():
        _cache = json.loads(_cache_path.read_text(encoding="utf-8"))
        print(f"[cache] Loaded {len(_cache)} cached translations")
    else:
        _cache = {}
        print("[cache] No cache file found, starting fresh")


def _save_cache():
    if _cache_path and _cache_dirty:
        _cache_path.write_text(json.dumps(_cache, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[cache] Saved {len(_cache)} translations to cache")


def _cache_key(source: str, target: str, text: str) -> str:
    return f"{source}|{target}|{text}"


def _build_translator(source: str, target: str) -> GoogleTranslator:
    return GoogleTranslator(source=source, target=target)


def _translate_one(text: str, translator: GoogleTranslator) -> str:
    if not text or not text.strip():
        return text
    try:
        result = translator.translate(text)
        time.sleep(REQUEST_DELAY)
        return result
    except Exception as e:
        print(f"  [warn] translate failed: '{text[:40]}...' : {e}")
        return text


def _translate_unique_map(unique_texts: list[str], source: str, target: str) -> dict[str, str]:
    global _cache_dirty
    mapping = {}
    to_translate = []

    for text in unique_texts:
        if not text or not text.strip():
            mapping[text] = text
            continue
        key = _cache_key(source, target, text)
        if key in _cache:
            mapping[text] = _cache[key]
        else:
            to_translate.append(text)

    cached = len(unique_texts) - len(to_translate)
    print(f"    {source}->{target}: {cached} cached, {len(to_translate)} new")

    if not to_translate:
        return mapping

    translator = _build_translator(source, target)
    for i, text in enumerate(to_translate):
        if (i + 1) % 50 == 0:
            print(f"    {source}->{target}: translating {i + 1}/{len(to_translate)}")
        result = _translate_one(text, translator)
        mapping[text] = result
        _cache[_cache_key(source, target, text)] = result
        _cache_dirty = True

    return mapping


def _make_multilang_from_maps(original: str, source_key: str, lang_maps: dict[str, dict[str, str]]) -> dict:
    out = {source_key: original}
    for lang, mapping in lang_maps.items():
        out[lang] = mapping.get(original, original)
    return out


def _make_multilang_list_from_maps(original: list[str], source_key: str, lang_maps: dict[str, dict[str, str]]) -> dict:
    out = {source_key: original}
    for lang, mapping in lang_maps.items():
        out[lang] = [mapping.get(t, t) for t in original]
    return out


def translate_tier_list(data_dir: Path):
    tier_path = data_dir / "tier_list.json"
    if not tier_path.exists():
        print("[translate] tier_list.json not found, skipping")
        return

    tier_data = json.loads(tier_path.read_text(encoding="utf-8"))

    unique_texts = set()
    for tier in tier_data.get("tiers", []):
        for deck in tier.get("decks", []):
            if isinstance(deck.get("features"), list):
                unique_texts.update(t for t in deck["features"] if t and t.strip())
            if isinstance(deck.get("description"), str) and deck["description"].strip():
                unique_texts.add(deck["description"])

    unique_list = sorted(unique_texts)
    print(f"  Tier list: {len(unique_list)} unique strings")

    lang_maps = {}
    for lang in TARGET_LANGS_JA:
        lang_maps[lang] = _translate_unique_map(unique_list, "ja", lang)

    for tier in tier_data.get("tiers", []):
        for deck in tier.get("decks", []):
            if isinstance(deck.get("features"), list) and deck["features"]:
                deck["features"] = _make_multilang_list_from_maps(deck["features"], "ja", lang_maps)
            if isinstance(deck.get("description"), str) and deck["description"].strip():
                deck["description"] = _make_multilang_from_maps(deck["description"], "ja", lang_maps)

    tier_path.write_text(json.dumps(tier_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print("[translate] tier_list.json done")


def translate_decks(data_dir: Path):
    decks_path = data_dir / "decks.json"
    if not decks_path.exists():
        print("[translate] decks.json not found, skipping")
        return

    decks = json.loads(decks_path.read_text(encoding="utf-8"))

    unique_texts = set()
    for deck in decks:
        if isinstance(deck.get("description"), str) and deck["description"].strip():
            unique_texts.add(deck["description"])
        for card in deck.get("cards", []):
            if isinstance(card.get("role"), str) and card["role"].strip():
                unique_texts.add(card["role"])
        for step in deck.get("strategy", []):
            if isinstance(step.get("title"), str) and step["title"].strip():
                unique_texts.add(step["title"])
            if isinstance(step.get("text"), str) and step["text"].strip():
                unique_texts.add(step["text"])

    unique_list = sorted(unique_texts)
    print(f"  Decks: {len(unique_list)} unique strings")

    lang_maps = {}
    for lang in TARGET_LANGS_JA:
        lang_maps[lang] = _translate_unique_map(unique_list, "ja", lang)

    for deck in decks:
        if isinstance(deck.get("description"), str) and deck["description"].strip():
            deck["description"] = _make_multilang_from_maps(deck["description"], "ja", lang_maps)
        for card in deck.get("cards", []):
            if isinstance(card.get("role"), str) and card["role"].strip():
                card["role"] = _make_multilang_from_maps(card["role"], "ja", lang_maps)
        for step in deck.get("strategy", []):
            if isinstance(step.get("title"), str) and step["title"].strip():
                step["title"] = _make_multilang_from_maps(step["title"], "ja", lang_maps)
            if isinstance(step.get("text"), str) and step["text"].strip():
                step["text"] = _make_multilang_from_maps(step["text"], "ja", lang_maps)

    decks_path.write_text(json.dumps(decks, ensure_ascii=False, indent=2), encoding="utf-8")
    print("[translate] decks.json done")


def translate_cards(data_dir: Path):
    cards_path = data_dir / "cards.json"
    if not cards_path.exists():
        print("[translate] cards.json not found, skipping")
        return

    cards = json.loads(cards_path.read_text(encoding="utf-8"))

    SKILL_KEYS = ["oshiSkill", "spSkill", "effectC", "effectB", "effectG", "art1", "art2"]
    unique_texts = set()
    for c in cards:
        for sk in SKILL_KEYS:
            obj = c.get(sk)
            if obj and isinstance(obj, dict):
                if obj.get("effect") and isinstance(obj["effect"], str):
                    unique_texts.add(obj["effect"])
        if isinstance(c.get("supportEffect"), str) and c["supportEffect"].strip():
            unique_texts.add(c["supportEffect"])
        if isinstance(c.get("yellEffect"), str) and c["yellEffect"].strip():
            unique_texts.add(c["yellEffect"])
        if isinstance(c.get("extra"), str) and c["extra"].strip():
            unique_texts.add(c["extra"])

    unique_list = sorted(unique_texts)
    print(f"  Cards: {len(unique_list)} unique effect strings")

    lang_maps = {}
    for lang in TARGET_LANGS_ZH:
        lang_maps[lang] = _translate_unique_map(unique_list, "zh-TW", lang)

    for c in cards:
        for sk in SKILL_KEYS:
            obj = c.get(sk)
            if obj and isinstance(obj, dict) and isinstance(obj.get("effect"), str) and obj["effect"].strip():
                obj["effect"] = _make_multilang_from_maps(obj["effect"], "zh-TW", lang_maps)
        if isinstance(c.get("supportEffect"), str) and c["supportEffect"].strip():
            c["supportEffect"] = _make_multilang_from_maps(c["supportEffect"], "zh-TW", lang_maps)
        if isinstance(c.get("yellEffect"), str) and c["yellEffect"].strip():
            c["yellEffect"] = _make_multilang_from_maps(c["yellEffect"], "zh-TW", lang_maps)
        if isinstance(c.get("extra"), str) and c["extra"].strip():
            c["extra"] = _make_multilang_from_maps(c["extra"], "zh-TW", lang_maps)

    cards_path.write_text(json.dumps(cards, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[translate] cards.json done ({len(unique_list)} unique strings)")


def translate_guides(data_dir: Path):
    guides_path = data_dir / "all_guides.json"
    if not guides_path.exists():
        print("[translate] all_guides.json not found, skipping")
        return

    guides = json.loads(guides_path.read_text(encoding="utf-8"))

    unique_texts = set()
    for deck in guides:
        if isinstance(deck.get("description"), str) and deck["description"].strip():
            unique_texts.add(deck["description"])
        for card in deck.get("cards", []):
            if isinstance(card.get("role"), str) and card["role"].strip():
                unique_texts.add(card["role"])
        for step in deck.get("strategy", []):
            if isinstance(step.get("title"), str) and step["title"].strip():
                unique_texts.add(step["title"])
            if isinstance(step.get("text"), str) and step["text"].strip():
                unique_texts.add(step["text"])

    unique_list = sorted(unique_texts)
    print(f"  Guides: {len(unique_list)} unique strings")

    lang_maps = {}
    for lang in TARGET_LANGS_JA:
        lang_maps[lang] = _translate_unique_map(unique_list, "ja", lang)

    for deck in guides:
        if isinstance(deck.get("description"), str) and deck["description"].strip():
            deck["description"] = _make_multilang_from_maps(deck["description"], "ja", lang_maps)
        for card in deck.get("cards", []):
            if isinstance(card.get("role"), str) and card["role"].strip():
                card["role"] = _make_multilang_from_maps(card["role"], "ja", lang_maps)
        for step in deck.get("strategy", []):
            if isinstance(step.get("title"), str) and step["title"].strip():
                step["title"] = _make_multilang_from_maps(step["title"], "ja", lang_maps)
            if isinstance(step.get("text"), str) and step["text"].strip():
                step["text"] = _make_multilang_from_maps(step["text"], "ja", lang_maps)

    guides_path.write_text(json.dumps(guides, ensure_ascii=False, indent=2), encoding="utf-8")
    print("[translate] all_guides.json done")


def translate_all(data_dir: Path):
    base_dir = data_dir.parent
    _load_cache(base_dir)

    print("[translate] Translating tier_list.json...")
    translate_tier_list(data_dir)
    print("[translate] Translating decks.json...")
    translate_decks(data_dir)
    print("[translate] Translating all_guides.json...")
    translate_guides(data_dir)
    print("[translate] Translating cards.json...")
    translate_cards(data_dir)

    _save_cache()
    print("[translate] All translations complete")


if __name__ == "__main__":
    translate_all(Path(__file__).resolve().parent.parent / "data")
