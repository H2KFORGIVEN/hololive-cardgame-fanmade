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


def _build_anchor_to_vtuber(soup: BeautifulSoup) -> dict[str, str]:
    """Map anchor id (e.g. #kuroni-) to the vtuber name text from its h3.
    Used so tier-table icon cells that only have `<a href="#xxx">` can be
    resolved back to the deck block further down the page."""
    mapping: dict[str, str] = {}
    for h3 in soup.find_all("h3"):
        name = h3.get_text(strip=True)
        if not name:
            continue
        # Anchor can appear as h3 id attr, or as a wrapping/nested <a name=...>/<a id=...>
        ids: set[str] = set()
        if h3.get("id"):
            ids.add(h3["id"])
        for a in h3.find_all("a"):
            if a.get("id"):
                ids.add(a["id"])
            if a.get("name"):
                ids.add(a["name"])
        # Preceding siblings sometimes carry <a id="xxx"></a> right before the h3
        prev = h3.find_previous_sibling()
        for _ in range(3):
            if not prev or not isinstance(prev, Tag):
                break
            for a in prev.find_all("a") if prev.name != "a" else [prev]:
                if a.get("id"):
                    ids.add(a["id"])
                if a.get("name"):
                    ids.add(a["name"])
            prev = prev.find_previous_sibling()
        for aid in ids:
            mapping[aid.lstrip("#")] = name
    return mapping


def _extract_tier_table_entries(soup: BeautifulSoup) -> list[tuple[int, str, str, str]]:
    """Parse the tier summary table at the top of the page.
    Returns list of (tier_num, anchor_id, image_url, label) tuples.
    `label` is best-effort: alt text, else derived from the anchor, else empty."""
    entries: list[tuple[int, str, str, str]] = []
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        for row in rows:
            th = row.find("th")
            if not th:
                continue
            header = th.get_text(strip=True)
            m = re.match(r"Tier(\d+)", header)
            if not m:
                continue
            tier_num = int(m.group(1))
            for cell in row.find_all(["td", "th"]):
                if cell is th:
                    continue
                img = cell.find("img")
                if not img:
                    continue
                image_url = img.get("src", "")
                alt = img.get("alt", "").strip()
                anchor = ""
                for a in cell.find_all("a"):
                    href = (a.get("href") or "").strip()
                    if href.startswith("#"):
                        anchor = href.lstrip("#")
                        break
                    if "#" in href and "wp-admin" not in href:
                        anchor = href.split("#", 1)[1]
                        break
                entries.append((tier_num, anchor, image_url, alt))
    return entries


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

    # First pass: detailed h3/h4 deck blocks (existing logic).
    seen_vtuber_per_tier: dict[int, set[str]] = {}
    for tier_num, h2 in tier_sections:
        tier_data: dict = {"tier": tier_num, "decks": []}
        seen = seen_vtuber_per_tier.setdefault(tier_num, set())

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
                    seen.add(vtuber_name)

        result["tiers"].append(tier_data)

    # Second pass: tier-table icons. Some decks appear in the top tier TABLE as
    # icons (with anchor links) but don't have their own h3/h4 detailed block —
    # the source site lists them as tier placements without a write-up. Add them
    # as minimal deck entries so guide tagging and UI tier filters cover them.
    anchor_map = _build_anchor_to_vtuber(soup)
    table_entries = _extract_tier_table_entries(soup)

    added_from_table = 0
    tier_lookup: dict[int, dict] = {t["tier"]: t for t in result["tiers"]}
    for tier_num, anchor, image_url, alt in table_entries:
        vtuber = anchor_map.get(anchor, "") or alt
        if not vtuber:
            continue
        seen = seen_vtuber_per_tier.setdefault(tier_num, set())
        if vtuber in seen:
            continue  # already captured via detailed section

        td = tier_lookup.get(tier_num)
        if not td:
            td = {"tier": tier_num, "decks": []}
            result["tiers"].append(td)
            tier_lookup[tier_num] = td

        deck_name = f"{vtuber}単"  # synthetic name — matches convention for mono-color decks
        td["decks"].append({
            "name": deck_name,
            "image": image_url or None,
            "ratings": {},
            "features": [],
            "recipe_url": None,
            "vtuber": vtuber,
            "id": _slugify(f"{vtuber}-{deck_name}"),
            "_from_tier_table": True,  # flag so UI / matcher can distinguish
        })
        seen.add(vtuber)
        added_from_table += 1

    result["tiers"].sort(key=lambda t: t["tier"])

    out_path = output_dir / "tier_list.json"
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    total = sum(len(t["decks"]) for t in result["tiers"])
    print(f"[scrape_tiers] Saved {total} decks across {len(result['tiers'])} tiers (+{added_from_table} from tier table icons)")
    return result


if __name__ == "__main__":
    scrape_tiers(Path(__file__).resolve().parent.parent / "data")
