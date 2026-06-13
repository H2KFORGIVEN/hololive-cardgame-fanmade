"""Scrape individual deck recipe pages for card details and strategy."""

import json
import re
import time
from pathlib import Path

import httpx
from bs4 import BeautifulSoup, Tag

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; HoloCardBot/1.0)"}
REQUEST_DELAY = 1.5


CARD_TABLE_KEYWORDS = ["採用カード", "収録カード", "入れ替え候補", "おすすめカード"]
BLOOM_PREFIXES = ["推し", "Debut", "1st", "2nd", "Spot", "spot", "推しホロメン", "エールデッキ"]


def _is_card_table(table) -> bool:
    thead = table.find("thead")
    if thead:
        text = thead.get_text(strip=True)
        if any(kw in text for kw in CARD_TABLE_KEYWORDS):
            return True
    first_row = table.find("tr")
    if first_row:
        text = first_row.get_text(strip=True)
        if any(kw in text for kw in CARD_TABLE_KEYWORDS):
            return True
    return False


def _clean_card_name(raw: str) -> str:
    """Deduplicate and clean up card names extracted from HTML cells."""
    parts = []
    seen = set()
    for part in raw.split():
        part = part.strip("　 ")
        if part and part not in seen:
            seen.add(part)
            parts.append(part)
    return " ".join(parts)


def _extract_card_entries(soup: BeautifulSoup) -> list[dict]:
    """Extract card entries from deck guide tables with card images + role text."""
    entries: list[dict] = []
    seen_keys: set[str] = set()

    for table in soup.find_all("table"):
        if not _is_card_table(table):
            continue

        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 2:
                continue

            card_cell = cells[0]
            role_cell = cells[1]

            img = card_cell.find("img")
            if not img:
                continue
            image_url = img.get("src", "")

            card_id_match = None
            if image_url:
                m = re.search(r"(h[A-Z]{2}\d{2}-\d{3})", image_url)
                if m:
                    card_id_match = m.group(1)

            name_parts = []
            for el in card_cell.find_all(["strong", "span"]):
                txt = el.get_text(strip=True)
                if txt and len(txt) < 50:
                    name_parts.append(txt)
            raw_name = " ".join(name_parts) if name_parts else card_cell.get_text(strip=True)[:60]
            card_name = _clean_card_name(raw_name)

            dedup_key = card_id_match or card_name
            if dedup_key in seen_keys:
                continue
            seen_keys.add(dedup_key)

            role_text = role_cell.get_text("\n", strip=True)

            entries.append({
                "name": card_name,
                "card_id": card_id_match,
                "image": image_url,
                "role": role_text,
            })
    return entries


def _build_cards_db(cards_path: Path) -> dict:
    """Build lookup dicts from cards.json for resolving missing card IDs."""
    if not cards_path.exists():
        return {}
    cards = json.loads(cards_path.read_text(encoding="utf-8"))
    db = {}
    for c in cards:
        name = c.get("name", "")
        bloom = c.get("bloomLevel", "")
        card_type = c.get("type", "")
        img = c.get("imageUrl", "")
        entry = {"id": c["id"], "name": name, "bloom": bloom, "type": card_type, "imageUrl": img}
        db.setdefault(name, []).append(entry)
    return db


def _extract_vtuber_from_title(title: str) -> str | None:
    """Try to guess the main VTuber name from a deck title like '【ホロカ】赤井はあと単の...'."""
    m = re.search(r"【[^】]*】(.+?)(?:単|タン|たん|デッキ|の|と)", title)
    if m:
        name = m.group(1).strip()
        name = re.sub(r"[（(].+?[）)]", "", name).strip()
        return name
    return None


def _resolve_missing_ids(deck_list: list[dict], cards_db: dict):
    """Post-process: fill in missing card_id and imageUrl via name matching."""
    if not cards_db:
        return
    bloom_map = {
        "推し": "推し", "推しホロメン": "推し",
        "Debut": "Debut", "1st": "1st", "2nd": "2nd",
        "Spot": "Spot", "spot": "Spot",
    }
    for deck in deck_list:
        deck_vtuber = _extract_vtuber_from_title(deck.get("title", ""))
        for card in deck.get("cards", []):
            if card.get("card_id"):
                continue
            raw_name = card.get("name", "")
            name = _clean_card_name(raw_name)

            bloom_hint = None
            vtuber_name = name
            for prefix in sorted(BLOOM_PREFIXES, key=len, reverse=True):
                if name.startswith(prefix):
                    bloom_hint = bloom_map.get(prefix)
                    vtuber_name = name[len(prefix):].strip("　 ")
                    break

            if not vtuber_name and deck_vtuber:
                vtuber_name = deck_vtuber

            if not vtuber_name:
                continue

            candidates = cards_db.get(vtuber_name, [])
            if not candidates:
                for db_name, db_entries in cards_db.items():
                    if vtuber_name in db_name or db_name in vtuber_name:
                        candidates = db_entries
                        break

            if not candidates:
                continue

            if bloom_hint and len(candidates) > 1:
                filtered = [c for c in candidates if c["bloom"] == bloom_hint]
                if filtered:
                    candidates = filtered

            best = candidates[0]
            card["card_id"] = best["id"]
            if best.get("imageUrl"):
                card["image"] = best["imageUrl"]
            card["name"] = f"{best.get('bloom', '')} {best['name']}".strip()


def _extract_strategy(soup: BeautifulSoup) -> list[dict]:
    """Extract turn-by-turn strategy from h3 headings containing ターン目."""
    strategies: list[dict] = []
    for h3 in soup.find_all("h3", class_="wp-block-heading"):
        title = h3.get_text(strip=True)
        if "ターン目" not in title:
            continue
        paragraphs = []
        sibling = h3.find_next_sibling()
        while sibling and sibling.name not in ("h2", "h3"):
            if isinstance(sibling, Tag) and sibling.name == "p":
                text = sibling.get_text(strip=True)
                if text:
                    paragraphs.append(text)
            sibling = sibling.find_next_sibling()
        strategies.append({"title": title, "text": "\n".join(paragraphs)})
    return strategies


AD_DOMAINS = ["mercardholo", "amazon", "a8.net", "valuecommerce", "moshimo.com"]
DECK_H2_KEYWORDS = ["デッキ構成", "デッキレシピ", "デッキリスト", "レシピ"]


def _is_ad_figure(fig) -> bool:
    a = fig.find("a")
    if not a:
        return False
    href = a.get("href", "")
    if any(ad in href for ad in AD_DOMAINS):
        return True
    if href and "holocardstrategy.jp" not in href:
        return True
    return False


def _extract_deck_image(soup: BeautifulSoup) -> str | None:
    """Extract the main deck overview image from a deck detail page.

    The deck's hero graphic lives in a <figure class="wp-block-image"> right
    after a heading like "クロニー単のデッキレシピ" / "デッキ構成". We scan the
    article for a wp-block-image figure under any matching heading — NOT the
    og:image (that's usually the author's generic social preview).

    Priority:
      1. Heading (h2/h3) matching deck keywords → next wp-block-image figure.
      2. First non-ad, non-linked wp-block-image figure in the article body.
    """
    for h in soup.find_all(["h2", "h3"], class_="wp-block-heading"):
        h_text = h.get_text(strip=True)
        if not any(kw in h_text for kw in DECK_H2_KEYWORDS):
            continue
        sib = h.find_next_sibling()
        for _ in range(8):
            if not sib:
                break
            if getattr(sib, "name", None) == "figure":
                cls = " ".join(sib.get("class", []))
                if "wp-block-image" in cls and not _is_ad_figure(sib):
                    img = sib.find("img")
                    if img and img.get("src"):
                        return img["src"].strip()
            sib = sib.find_next_sibling() if hasattr(sib, "find_next_sibling") else None

    for fig in soup.find_all("figure", class_="wp-block-image", limit=10):
        if _is_ad_figure(fig):
            continue
        a = fig.find("a")
        if a and a.get("href", ""):
            continue
        img = fig.find("img")
        if img and img.get("src"):
            return img["src"].strip()

    return None


def _extract_description(soup: BeautifulSoup) -> str:
    """Extract the intro paragraph."""
    meta = soup.find("meta", attrs={"name": "description"})
    if meta and meta.get("content"):
        return meta["content"].strip()
    entry_content = soup.find("div", class_="post_content")
    if not entry_content:
        entry_content = soup
    for p in entry_content.find_all("p", limit=15):
        text = p.get_text(strip=True)
        if len(text) > 40 and "出典" not in text and "目次" not in text:
            return text
    return ""


def _extract_date(soup: BeautifulSoup) -> str | None:
    time_tag = soup.find("time", attrs={"datetime": True})
    if time_tag:
        return time_tag["datetime"]
    return None


def scrape_deck(url: str) -> dict:
    resp = httpx.get(url, timeout=30, follow_redirects=True, headers=HEADERS)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")

    title_el = soup.find("h1")
    title = title_el.get_text(strip=True) if title_el else url.split("/")[-2]

    result = {
        "url": url,
        "title": title,
        "deck_image": _extract_deck_image(soup),
        "description": _extract_description(soup),
        "cards": _extract_card_entries(soup),
        "strategy": _extract_strategy(soup),
    }
    date = _extract_date(soup)
    if date:
        result["date"] = date
    return result


DECK_CATEGORY_URL = "https://www.holocardstrategy.jp/category/deck/"
SKIP_SLUGS = [
    "saikyou-deck", "kankyoranking", "entrycup", "shopreport",
    "hitranking", "enclosure", "price", "_list", "_itiran",
    "startdeck", "start-deck", "wgp", "yusyoudeck", "chocodeck-entry",
    "our", "-ur", "bloomcup",
]


def _is_deck_guide_url(url: str) -> bool:
    slug = url.rstrip("/").split("/")[-1]
    for skip in SKIP_SLUGS:
        if skip in slug:
            return False
    return True


def _discover_all_deck_urls() -> list[str]:
    all_urls: list[str] = []
    for page in range(1, 20):
        url = DECK_CATEGORY_URL if page == 1 else f"{DECK_CATEGORY_URL}page/{page}/"
        try:
            resp = httpx.get(url, timeout=30, follow_redirects=True, headers=HEADERS)
            if resp.status_code != 200:
                break
        except Exception:
            break
        soup = BeautifulSoup(resp.text, "lxml")
        found = set()
        for a in soup.select("a[href*='holocardstrategy.jp']"):
            href = a.get("href", "").rstrip("/") + "/"
            if (
                "holocardstrategy.jp/" in href
                and "/category/" not in href
                and "/page/" not in href
                and href.count("/") >= 4
                and _is_deck_guide_url(href)
            ):
                found.add(href)
        all_urls.extend(found)
        time.sleep(0.5)
    return list(dict.fromkeys(all_urls))


def scrape_all_decks(tier_list_path: Path, output_dir: Path, cards_path: Path | None = None) -> list[dict]:
    output_dir.mkdir(parents=True, exist_ok=True)

    tier_data = json.loads(tier_list_path.read_text(encoding="utf-8"))
    cards_db = _build_cards_db(cards_path) if cards_path else {}

    urls_seen: set[str] = set()
    deck_results: list[dict] = []

    for tier in tier_data.get("tiers", []):
        for deck in tier.get("decks", []):
            url = deck.get("recipe_url")
            if not url or url in urls_seen:
                continue
            if "holocardstrategy.jp" not in url:
                continue
            urls_seen.add(url)

            print(f"  [tier] Scraping: {url}")
            try:
                result = scrape_deck(url)
                result["deck_id"] = deck["id"]
                result["tier"] = tier["tier"]
                deck_results.append(result)
            except Exception as e:
                print(f"  ERROR scraping {url}: {e}")

            time.sleep(REQUEST_DELAY)

    _resolve_missing_ids(deck_results, cards_db)

    out_path = output_dir / "decks.json"
    out_path.write_text(json.dumps(deck_results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[scrape_decks] Saved {len(deck_results)} tier-linked deck recipes to {out_path}")
    return deck_results


def scrape_all_guides(output_dir: Path, existing_urls: set[str] | None = None, cards_path: Path | None = None) -> list[dict]:
    """Discover and scrape ALL deck guide articles from the category pages."""
    output_dir.mkdir(parents=True, exist_ok=True)
    if existing_urls is None:
        existing_urls = set()
    cards_db = _build_cards_db(cards_path) if cards_path else {}

    print("  Discovering deck guide URLs from category pages...")
    all_urls = _discover_all_deck_urls()
    new_urls = [u for u in all_urls if u not in existing_urls and u.rstrip("/") + "/" not in {x.rstrip("/") + "/" for x in existing_urls}]
    print(f"  Found {len(all_urls)} total, {len(new_urls)} new (not in tier decks)")

    guide_results: list[dict] = []
    for i, url in enumerate(new_urls):
        print(f"  [{i+1}/{len(new_urls)}] {url}")
        try:
            result = scrape_deck(url)
            if not result.get("cards"):
                print(f"    Skipped (no card entries)")
                time.sleep(0.5)
                continue
            slug = url.rstrip("/").split("/")[-1]
            result["deck_id"] = f"guide-{slug}"
            result["tier"] = None
            result["source"] = "holocardstrategy_guide"
            guide_results.append(result)
        except Exception as e:
            print(f"    ERROR: {e}")
        time.sleep(REQUEST_DELAY)

    _resolve_missing_ids(guide_results, cards_db)

    out_path = output_dir / "all_guides.json"
    out_path.write_text(json.dumps(guide_results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[scrape_guides] Saved {len(guide_results)} deck guides to {out_path}")
    return guide_results


if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent
    scrape_all_decks(base / "data" / "tier_list.json", base / "data")
