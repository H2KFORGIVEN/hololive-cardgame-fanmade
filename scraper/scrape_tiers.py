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
    """Tier list scraper — tier-table-authoritative with h3/h4 enrichment.

    The source page has two disagreeing signals:
      - TIER TABLE (top icons) — the author's current tier placement.
      - h2 "TierN デッキの解説" with h3/h4 sections — keeps stale entries
        when a deck moves between tiers (e.g. わため's h4 still lives in
        the "Tier3 デッキの解説" h2 even though the top table placed her
        in Tier 2). h3 is NOT reliable as a tier source.

    Strategy:
      1. Build anchor → h4-blocks map by walking all h3/h4 sections
         regardless of which h2 they live under. Each h4 keeps its full
         deck block (image, ratings, features, recipe_url).
      2. Walk the tier TABLE. For each cell, resolve its anchor to the
         h3 entry, filter h4 blocks to those with a recipe_url (active
         decks only), and assign the TABLE's tier to each. Skip cells
         whose anchor doesn't resolve and has no usable alt text.

    Example from 2026-04-13:
      - Table T2 cell #watame → h3 "角巻わため" → h4 "わため単" (has link) → T2.
      - Table T3 cell #rapurasu → h3 "ラプラス・ダークネス" → 3 h4s, only
        "ラプ推しラプラス単" has link → T3.
      - h3 "ハコス・ベールズ" lives under T1 h2 section BUT no table cell
        references it → dropped (stale content).
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

    # Pass 1: build anchor → (vtuber, h4 blocks) map from every h3 on the page.
    # We read h3s inside any h2, because the table may reference an h3 that's
    # grouped under the "wrong" h2 (stale content). The table decides the tier;
    # the h3 just provides metadata.
    anchor_to_entry: dict[str, dict] = {}
    for h3 in soup.find_all("h3"):
        vtuber_name = h3.get_text(strip=True)
        if not vtuber_name:
            continue

        ids: set[str] = set()
        if h3.get("id"): ids.add(h3["id"])
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
            anchor_to_entry[aid] = entry

    # Pass 2: the tier table is the authoritative source of CURRENT placements.
    table_entries = _extract_tier_table_entries(soup)

    tiers_data: dict[int, list[dict]] = {}
    unresolved = 0

    for tier_num, anchor, image_url, alt in table_entries:
        entry = anchor_to_entry.get(anchor) if anchor else None

        if entry:
            # Include only h4 blocks with an active recipe link — those are
            # the decks the author maintains. h4s without a link are legacy.
            active_blocks = [b for b in entry["h4_blocks"] if b.get("recipe_url")]
            if active_blocks:
                for b in active_blocks:
                    if image_url and not b.get("image"):
                        b["image"] = image_url
                    tiers_data.setdefault(tier_num, []).append(b)
                continue
            # h3 resolves but no active deck block — fall through to synthetic
            vtuber = entry["vtuber"]
            tiers_data.setdefault(tier_num, []).append({
                "name": f"{vtuber}単",
                "image": image_url or None,
                "ratings": {}, "features": [], "recipe_url": None,
                "vtuber": vtuber, "id": _slugify(vtuber),
                "_from_tier_table": True, "_no_detail": True,
            })
            continue

        # Anchor unresolvable. Use alt text as a best-effort name.
        if alt:
            tiers_data.setdefault(tier_num, []).append({
                "name": f"{alt}単",
                "image": image_url or None,
                "ratings": {}, "features": [], "recipe_url": None,
                "vtuber": alt, "id": _slugify(alt),
                "_from_tier_table": True, "_no_detail": True,
            })
        else:
            unresolved += 1

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
        f"(skipped {unresolved} unresolvable table cells; tier TABLE authoritative)"
    )
    return result


if __name__ == "__main__":
    scrape_tiers(Path(__file__).resolve().parent.parent / "data")
