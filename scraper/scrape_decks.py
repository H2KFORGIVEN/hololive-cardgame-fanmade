"""Scrape individual deck recipe pages for card details and strategy."""

import json
import re
import time
from pathlib import Path

import httpx
from bs4 import BeautifulSoup, Tag

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; HoloCardBot/1.0)"}
REQUEST_DELAY = 1.5


def _extract_card_entries(soup: BeautifulSoup) -> list[dict]:
    """Extract card entries from 採用カード tables."""
    entries: list[dict] = []
    for table in soup.find_all("table"):
        thead = table.find("thead")
        if not thead:
            continue
        header_text = thead.get_text(strip=True)
        if "採用カード" not in header_text:
            continue

        for row in table.find("tbody").find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 2:
                continue

            card_cell = cells[0]
            role_cell = cells[1]

            img = card_cell.find("img")
            image_url = img["src"] if img else None

            card_id_match = None
            if image_url:
                m = re.search(r"(h[A-Z]{2}\d{2}-\d{3})", image_url)
                if m:
                    card_id_match = m.group(1)

            name_parts = []
            for el in card_cell.find_all(["strong", "span"]):
                t = el.get_text(strip=True)
                if t and len(t) < 50:
                    name_parts.append(t)
            card_name = " ".join(name_parts) if name_parts else card_cell.get_text(strip=True)[:60]

            role_text = role_cell.get_text("\n", strip=True)

            entries.append({
                "name": card_name,
                "card_id": card_id_match,
                "image": image_url,
                "role": role_text,
            })
    return entries


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


def _extract_deck_image(soup: BeautifulSoup) -> str | None:
    """Extract the main deck overview image (the large screenshot at the top)."""
    for h2 in soup.find_all("h2", class_="wp-block-heading"):
        if "デッキ構成" in h2.get_text(strip=True):
            fig = h2.find_next("figure", class_="wp-block-image")
            if fig:
                img = fig.find("img")
                if img:
                    return img.get("src")
    first_figure = soup.find("figure", class_="wp-block-image")
    if first_figure:
        img = first_figure.find("img")
        if img:
            return img.get("src")
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


def scrape_deck(url: str) -> dict:
    resp = httpx.get(url, timeout=30, follow_redirects=True, headers=HEADERS)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")

    title_el = soup.find("h1")
    title = title_el.get_text(strip=True) if title_el else url.split("/")[-2]

    return {
        "url": url,
        "title": title,
        "deck_image": _extract_deck_image(soup),
        "description": _extract_description(soup),
        "cards": _extract_card_entries(soup),
        "strategy": _extract_strategy(soup),
    }


def scrape_all_decks(tier_list_path: Path, output_dir: Path) -> list[dict]:
    output_dir.mkdir(parents=True, exist_ok=True)

    tier_data = json.loads(tier_list_path.read_text(encoding="utf-8"))

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

            print(f"  Scraping: {url}")
            try:
                result = scrape_deck(url)
                result["deck_id"] = deck["id"]
                result["tier"] = tier["tier"]
                deck_results.append(result)
            except Exception as e:
                print(f"  ERROR scraping {url}: {e}")

            time.sleep(REQUEST_DELAY)

    out_path = output_dir / "decks.json"
    out_path.write_text(json.dumps(deck_results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[scrape_decks] Saved {len(deck_results)} deck recipes to {out_path}")
    return deck_results


if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent
    scrape_all_decks(base / "data" / "tier_list.json", base / "data")
