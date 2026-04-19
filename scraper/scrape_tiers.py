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
    """Tier list scraper — TABLE-authoritative.

    The source page has two tier signals:
      1. A tier TABLE at the top with icon cells per tier row. Cells link to
         anchors (#xxx) that point at the detail h3 section further down.
      2. h3 detail sections inside h2 "TierN デッキの解説" areas.

    These drift apart — the author updates the TABLE when a deck's tier
    changes but often leaves the old h3 detail section in place. Using h3
    as the source of truth produces stale tier placements (e.g. ハコス・
    ベールズ was still tagged T1 even after the table dropped it).

    This implementation treats the TABLE as authoritative:
      - Walk each tier table row's cells, grab anchor + image for each deck.
      - Build an anchor → h3 metadata map from the whole page (may include
        stale h3s — that's fine, we only consult it when the table pointed
        at that anchor).
      - For each authoritative tier placement, enrich with detail section
        data (h4 deck blocks with ratings/features) when available.
      - Cells with unresolvable anchors (broken edit links, empty hrefs) are
        logged and skipped.
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

    # Build anchor → h3 metadata map. Each h3 gives us: vtuber name, list of
    # h4 deck blocks, and anchor ids.
    h3_by_anchor: dict[str, dict] = {}
    for h3 in soup.find_all("h3"):
        vtuber_name = h3.get_text(strip=True)
        if not vtuber_name:
            continue
        ids: set[str] = set()
        if h3.get("id"):
            ids.add(h3["id"])
        for a in h3.find_all("a"):
            if a.get("id"): ids.add(a["id"])
            if a.get("name"): ids.add(a["name"])
        prev = h3.find_previous_sibling()
        for _ in range(3):
            if not isinstance(prev, Tag):
                break
            for a in (prev.find_all("a") if prev.name != "a" else [prev]):
                if a.get("id"): ids.add(a["id"])
                if a.get("name"): ids.add(a["name"])
            prev = prev.find_previous_sibling()

        # Collect h4 deck blocks under this h3
        h4_blocks: list[dict] = []
        el = h3.find_next_sibling()
        while isinstance(el, Tag) and el.name not in ("h2", "h3"):
            if el.name == "h4":
                deck = _parse_deck_block(el)
                if deck:
                    deck["vtuber"] = vtuber_name
                    deck["id"] = _slugify(f"{vtuber_name}-{deck['name']}")
                    h4_blocks.append(deck)
            el = el.find_next_sibling()

        entry = {"vtuber": vtuber_name, "h4_blocks": h4_blocks}
        for aid in ids:
            h3_by_anchor[aid] = entry

    # Walk the tier TABLE — authoritative placements
    tier_entries = _extract_tier_table_entries(soup)

    tiers_data: dict[int, list[dict]] = {}
    skipped_broken = 0

    for tier_num, anchor, image_url, alt in tier_entries:
        if not anchor:
            skipped_broken += 1
            continue

        meta = h3_by_anchor.get(anchor)
        if not meta:
            # Try alt text as a last-resort name; still ship the entry so the
            # tier list mirrors what the page visually shows.
            if alt:
                tiers_data.setdefault(tier_num, []).append({
                    "name": f"{alt}単",
                    "image": image_url or None,
                    "ratings": {}, "features": [], "recipe_url": None,
                    "vtuber": alt, "id": _slugify(f"{alt}"),
                    "_from_tier_table": True,
                    "_no_detail": True,
                })
            else:
                skipped_broken += 1
            continue

        vtuber = meta["vtuber"]
        blocks = meta["h4_blocks"]

        if blocks:
            for b in blocks:
                # Prefer the table cell's image if the h4 didn't grab one
                if image_url and not b.get("image"):
                    b["image"] = image_url
                tiers_data.setdefault(tier_num, []).append(b)
        else:
            # Table cell exists but no detailed write-up — add a minimal entry
            tiers_data.setdefault(tier_num, []).append({
                "name": f"{vtuber}単",
                "image": image_url or None,
                "ratings": {}, "features": [], "recipe_url": None,
                "vtuber": vtuber, "id": _slugify(f"{vtuber}"),
                "_from_tier_table": True,
                "_no_detail": True,
            })

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
        f"(skipped {skipped_broken} broken table cells) — tier table is authoritative"
    )
    return result


if __name__ == "__main__":
    scrape_tiers(Path(__file__).resolve().parent.parent / "data")
