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

            # Scan ALL swell buttons — the first one may be an Amazon affiliate
            # (amzn.to/...) promoting a strategy book; the real recipe link comes
            # after. Only accept same-site links.
            if deck.get("recipe_url") is None:
                for link in sibling.find_all("a", class_="swell-block-button__link"):
                    href = (link.get("href") or "").strip()
                    if href and href != "#" and "holocardstrategy.jp" in href:
                        deck["recipe_url"] = href
                        break

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
    `label` is best-effort: alt text, else empty.

    Note: Tier 3 (and sometimes Tier 2) use `rowspan="3"` for the header cell,
    so the 2nd and 3rd rows have no th. We carry the current tier across rows
    that are part of the same rowspan group.
    """
    entries: list[tuple[int, str, str, str]] = []
    for table in soup.find_all("table"):
        current_tier: int | None = None
        for row in table.find_all("tr"):
            cells = row.find_all(["th", "td"])
            if not cells:
                continue

            # Check if the first cell is a Tier header (sets/resets current_tier)
            first = cells[0]
            m = re.match(r"Tier(\d+)", first.get_text(strip=True))
            if m:
                current_tier = int(m.group(1))
                data_cells = cells[1:]
            elif current_tier is None:
                continue  # not inside a tier row group yet
            else:
                data_cells = cells

            for cell in data_cells:
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
                entries.append((current_tier, anchor, image_url, alt))
    return entries


def scrape_tiers(output_dir: Path) -> dict:
    """Tier list scraper — recipe-link-authoritative.

    The source page has multiple tier signals, all partly unreliable:
      - Top TIER TABLE: icon cells with anchor links. Many cells have broken
        anchors (wp-admin edit hrefs, no img, or anchors pointing at unrelated
        h3s). Not usable as sole source.
      - h3 sections under h2 "TierN デッキの解説": include stale entries the
        author forgot to delete when a deck was demoted. h3 PRESENCE alone
        is not reliable.
      - h4 deck blocks under each h3 with a "レシピと回し方はこちら" button.
        THIS BUTTON IS THE RELIABLE SIGNAL: a deck only gets the button when
        the author maintains its recipe page. Decks without the button are
        demoted/archived.

    Logic:
      1. For each h2 "TierN デッキの解説", walk h3 (vtuber) → h4 (deck) blocks.
      2. A h4 block is considered "currently in TierN" iff its recipe_url
         resolves to a same-site link.
      3. Decks without a recipe_url are skipped — the author has removed
         the deck from the tier but left the h4 as legacy content.

    Example from 2026-04-13 snapshot:
      - T1 h3 "AZKi" → h4 "AZKi単" (link ✓), "AZKiカリ" (no link) → only AZKi単 kept.
      - T1 h3 "ハコス・ベールズ" → h4 "ミオ推しハコリズ" (link ✓) → kept.
      - T2 h3 "ラプラス・ダークネス" → 3 h4s, only "ラプ推しラプラス単" has link.
    """
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

    tier_headings: list[tuple[int, Tag]] = []
    for h2 in soup.find_all("h2"):
        m = re.match(r"Tier(\d+)デッキ", h2.get_text(strip=True))
        if m:
            tier_headings.append((int(m.group(1)), h2))

    tiers_data: dict[int, list[dict]] = {}
    skipped_no_link = 0

    for tier_num, h2 in tier_headings:
        next_h2 = h2.find_next_sibling("h2")
        current_h3_name: str | None = None
        el = h2.find_next_sibling()
        while el and el is not next_h2:
            if isinstance(el, Tag):
                if el.name == "h3":
                    current_h3_name = el.get_text(strip=True)
                elif el.name == "h4" and current_h3_name:
                    deck = _parse_deck_block(el)
                    if deck:
                        if not deck.get("recipe_url"):
                            # No active recipe link — deck is legacy, not
                            # in the current tier placement.
                            skipped_no_link += 1
                        else:
                            deck["vtuber"] = current_h3_name
                            deck["id"] = _slugify(f"{current_h3_name}-{deck['name']}")
                            tiers_data.setdefault(tier_num, []).append(deck)
            el = el.find_next_sibling()

    result = {
        "updated": updated,
        "source": TIER_URL,
        "tiers": [
            {"tier": t, "decks": tiers_data[t]}
            for t in sorted(tiers_data)
        ],
    }

    out_path = output_dir / "tier_list.json"
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    total = sum(len(t["decks"]) for t in result["tiers"])
    print(
        f"[scrape_tiers] Saved {total} decks across {len(result['tiers'])} tiers "
        f"(skipped {skipped_no_link} h4 blocks with no recipe link — legacy decks)"
    )
    return result


if __name__ == "__main__":
    scrape_tiers(Path(__file__).resolve().parent.parent / "data")
