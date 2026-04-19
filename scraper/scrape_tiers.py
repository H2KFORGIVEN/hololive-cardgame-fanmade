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
    """Tier list scraper — hybrid: top tier TABLE wins, h2 sections fill gaps.

    The source page has two disagreeing signals (verified 2026-04-19):
      - TOP TIER TABLE (icons) — most up-to-date placements. User confirmed
        わため belongs in T2 and ラプラス in T3, which is what the TABLE shows,
        NOT what the h2 sections show (those keep legacy groupings).
      - h2 "TierN デッキの解説" with h3/h4 — includes decks the TABLE dropped
        or with broken anchors (e.g. hakorizu: table cell's anchor is a
        wp-admin edit URL; ミオ/あやめ: table cells exist but anchors empty).
        These must still appear in the tier list because they have working
        recipe links.

    Hybrid resolution:
      1. Walk h2 sections → collect {vtuber: h4_blocks_with_recipe_url}.
      2. Walk tier TABLE cells → if anchor resolves to a vtuber with active
         h4 blocks, place those at the TABLE's tier.
      3. For any h4 block not placed by (2), put it at the tier where its h2
         lives (fallback for table-missing decks like hakorizu).
      4. Only h4 blocks with a same-site recipe_url are ever included;
         legacy decks without a link are dropped.
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

    # Pass 1: walk h2 sections → build {vtuber_name: [(fallback_tier, h4_block), ...]}
    # and anchor → vtuber map for the table resolution.
    vtuber_blocks: dict[str, list[tuple[int, dict]]] = {}
    anchor_to_vtuber: dict[str, str] = {}
    skipped_no_link = 0

    for tier_num, h2 in tier_headings:
        next_h2 = h2.find_next_sibling("h2")
        current_h3_name: str | None = None
        current_h3_ids: set[str] = set()
        el = h2.find_next_sibling()
        while el and el is not next_h2:
            if isinstance(el, Tag):
                if el.name == "h3":
                    current_h3_name = el.get_text(strip=True)
                    current_h3_ids = set()
                    if el.get("id"): current_h3_ids.add(el["id"])
                    for a in el.find_all("a"):
                        if a.get("id"): current_h3_ids.add(a["id"])
                        if a.get("name"): current_h3_ids.add(a["name"])
                    prev = el.find_previous_sibling()
                    for _ in range(3):
                        if not isinstance(prev, Tag):
                            break
                        for a in (prev.find_all("a") if prev.name != "a" else [prev]):
                            if a.get("id"): current_h3_ids.add(a["id"])
                            if a.get("name"): current_h3_ids.add(a["name"])
                        prev = prev.find_previous_sibling()
                    for aid in current_h3_ids:
                        anchor_to_vtuber[aid] = current_h3_name
                elif el.name == "h4" and current_h3_name:
                    deck = _parse_deck_block(el)
                    if deck:
                        if not deck.get("recipe_url"):
                            skipped_no_link += 1
                        else:
                            deck["vtuber"] = current_h3_name
                            deck["id"] = _slugify(f"{current_h3_name}-{deck['name']}")
                            vtuber_blocks.setdefault(current_h3_name, []).append((tier_num, deck))
            el = el.find_next_sibling()

    # Pass 2: walk the tier TABLE. Authoritative placement if cell's anchor
    # resolves to a vtuber with active blocks. Mark those vtubers as placed.
    table_entries = _extract_tier_table_entries(soup)
    tiers_data: dict[int, list[dict]] = {}
    placed_vtubers: set[str] = set()

    for table_tier, anchor, image_url, alt in table_entries:
        vtuber = anchor_to_vtuber.get(anchor) if anchor else None
        if not vtuber and alt:
            vtuber = alt if alt in vtuber_blocks else None
        if not vtuber:
            continue
        if vtuber in placed_vtubers:
            continue
        blocks = vtuber_blocks.get(vtuber, [])
        if not blocks:
            continue
        placed_vtubers.add(vtuber)
        for _, block in blocks:
            tiers_data.setdefault(table_tier, []).append(block)

    # Pass 3: fallback — any vtuber not resolved by the TABLE falls back to
    # their h2 section's tier. Covers decks with broken table anchors
    # (hakorizu, ミオ, あやめ when their alt/anchor doesn't match).
    for vtuber, blocks in vtuber_blocks.items():
        if vtuber in placed_vtubers:
            continue
        for fallback_tier, block in blocks:
            tiers_data.setdefault(fallback_tier, []).append(block)

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
    placed_by_table = len(placed_vtubers)
    total_vtubers = len(vtuber_blocks)
    print(
        f"[scrape_tiers] Saved {total} decks across {len(result['tiers'])} tiers "
        f"({placed_by_table}/{total_vtubers} vtubers placed by TABLE, "
        f"rest by h2 fallback; skipped {skipped_no_link} legacy h4s)"
    )
    return result


if __name__ == "__main__":
    scrape_tiers(Path(__file__).resolve().parent.parent / "data")
