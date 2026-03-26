"""Scrape tier list and deck info from holocardstrategy.jp."""

import json
import re
from pathlib import Path

import httpx
from bs4 import BeautifulSoup, Tag

TIER_URL = "https://www.holocardstrategy.jp/saikyou-deck/"
RATING_KEYS = ["firepower", "ease", "stability", "endurance", "pressure"]


def _slugify(name: str) -> str:
    return re.sub(r"[^\w]", "-", name.lower()).strip("-")


def _parse_deck_block(h4: Tag) -> dict | None:
    """Parse a single deck block starting from its h4 heading."""
    deck_name = h4.get_text(strip=True)
    if not deck_name:
        return None

    deck: dict = {
        "name": deck_name,
        "image": None,
        "ratings": {},
        "features": [],
        "recipe_url": None,
    }

    sibling = h4.find_next_sibling()
    while sibling and sibling.name not in ("h2", "h3", "h4"):
        if isinstance(sibling, Tag):
            img = sibling.find("img")
            if img and not deck["image"]:
                deck["image"] = img.get("src", "")

            tables = sibling.find_all("table")
            for table in tables:
                rows = table.find_all("tr")
                if len(rows) >= 2:
                    headers = [th.get_text(strip=True) for th in rows[0].find_all(["th", "td"])]
                    values = [td.get_text(strip=True) for td in rows[1].find_all(["th", "td"])]
                    if "火力" in headers and len(values) == len(RATING_KEYS):
                        deck["ratings"] = dict(zip(RATING_KEYS, values))
                    elif "デッキの特徴と強み" in headers:
                        cell = rows[1].find("td")
                        if cell:
                            text = cell.get_text("\n", strip=True)
                            deck["features"] = [
                                line.lstrip("・").strip()
                                for line in text.split("\n")
                                if line.strip()
                            ]

            link = sibling.find("a", class_="swell-block-button__link")
            if link and link.get("href"):
                href = link["href"].strip()
                if href and href != "#":
                    deck["recipe_url"] = href

        sibling = sibling.find_next_sibling()

    return deck


def scrape_tiers(output_dir: Path) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)

    resp = httpx.get(
        TIER_URL,
        timeout=30,
        follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 (compatible; HoloCardBot/1.0)"},
    )
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")

    title_el = soup.find("h1")
    date_match = re.search(r"(\d{4})年(\d{1,2})月", title_el.get_text() if title_el else "")
    updated = ""
    if date_match:
        updated = f"{date_match.group(1)}-{int(date_match.group(2)):02d}"

    tier_headings = soup.find_all("h2", class_="wp-block-heading")
    tier_sections: list[tuple[int, Tag]] = []
    for h2 in tier_headings:
        text = h2.get_text(strip=True)
        m = re.match(r"Tier(\d+)", text)
        if m:
            tier_sections.append((int(m.group(1)), h2))

    result = {"updated": updated, "source": TIER_URL, "tiers": []}

    for tier_num, h2 in tier_sections:
        tier_data: dict = {"tier": tier_num, "decks": []}

        next_boundary = h2.find_next_sibling("h2")

        h3_tags = []
        el = h2.find_next_sibling()
        while el and el != next_boundary:
            if isinstance(el, Tag) and el.name == "h3":
                h3_tags.append(el)
            el = el.find_next_sibling()

        for h3 in h3_tags:
            vtuber_name = h3.get_text(strip=True)
            h4_tags = []
            el = h3.find_next_sibling()
            while el and el.name not in ("h2", "h3"):
                if isinstance(el, Tag) and el.name == "h4":
                    h4_tags.append(el)
                el = el.find_next_sibling()

            for h4 in h4_tags:
                deck = _parse_deck_block(h4)
                if deck:
                    deck["vtuber"] = vtuber_name
                    deck["id"] = _slugify(f"{vtuber_name}-{deck['name']}")
                    tier_data["decks"].append(deck)

        result["tiers"].append(tier_data)

    out_path = output_dir / "tier_list.json"
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    total = sum(len(t["decks"]) for t in result["tiers"])
    print(f"[scrape_tiers] Saved {total} decks across {len(result['tiers'])} tiers to {out_path}")
    return result


if __name__ == "__main__":
    scrape_tiers(Path(__file__).resolve().parent.parent / "data")
