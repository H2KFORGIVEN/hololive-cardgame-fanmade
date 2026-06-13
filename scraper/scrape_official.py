"""Scrape official recommended decks from en.hololive-official-cardgame.com."""

import re
import time
import json
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

BASE_URL = "https://en.hololive-official-cardgame.com"
LIST_URL = f"{BASE_URL}/deck/recommend/"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; HoloCardMeta/1.0)"}
REQUEST_DELAY = 1.5


def _parse_card_id_from_src(src: str) -> str:
    """Extract card ID like 'hBP01-009' from image src path."""
    m = re.search(r"(h[A-Z]{1,3}\d{2}-\d{3})", src)
    return m.group(1) if m else ""


def _parse_count(text: str) -> int:
    m = re.search(r"(\d+)", text)
    return int(m.group(1)) if m else 1


def _collect_deck_urls() -> list[dict]:
    """Crawl all paginated list pages, return [{url, date_text, title}]."""
    results = []
    page = 1
    while True:
        url = LIST_URL if page == 1 else f"{LIST_URL}page/{page}/"
        try:
            resp = httpx.get(url, timeout=30, follow_redirects=True, headers=HEADERS)
            if resp.status_code != 200:
                break
        except httpx.HTTPError:
            break

        soup = BeautifulSoup(resp.text, "lxml")
        links = [
            a for a in soup.select("a[href]")
            if "/deck/" in a["href"]
            and "/recommend" not in a["href"]
            and a["href"].rstrip("/").split("/")[-1] not in ("deck", "")
        ]

        if not links:
            break

        for a in links:
            href = a["href"]
            if not href.startswith("http"):
                href = BASE_URL + href
            text = a.get_text(" ", strip=True)
            date_m = re.search(
                r"((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.\s*\d{1,2},\s*\d{4})",
                text,
            )
            results.append({
                "url": href,
                "date_text": date_m.group(1) if date_m else "",
            })

        page += 1
        time.sleep(REQUEST_DELAY)

    seen = set()
    unique = []
    for r in results:
        if r["url"] not in seen:
            seen.add(r["url"])
            unique.append(r)
    return unique


_MONTH_MAP = {
    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
    "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
    "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12",
}


def _parse_date(text: str) -> str:
    """Convert 'Feb. 27, 2026' to '2026-02-27'."""
    m = re.match(r"(\w+)\.\s*(\d{1,2}),\s*(\d{4})", text.strip())
    if not m:
        return ""
    mon = _MONTH_MAP.get(m.group(1), "01")
    day = m.group(2).zfill(2)
    return f"{m.group(3)}-{mon}-{day}"


def _scrape_deck_page(url: str) -> dict | None:
    """Scrape a single official deck detail page."""
    try:
        resp = httpx.get(url, timeout=30, follow_redirects=True, headers=HEADERS)
        resp.raise_for_status()
    except httpx.HTTPError as e:
        print(f"  [WARN] Failed {url}: {e}")
        return None

    soup = BeautifulSoup(resp.text, "lxml")
    con = soup.select_one(".deck-con")
    if not con:
        return None

    h1 = con.find("h1")
    title = h1.get_text(strip=True) if h1 else url.split("/")[-2]

    desc_p = con.find("p", recursive=False)
    description = desc_p.get_text(strip=True) if desc_p and not desc_p.get("class") else ""

    block = con.select_one(".block")
    if not block:
        return None

    oshi_box = block.select_one(".card-box.holomen")
    oshi_card_id = ""
    oshi_name = ""
    oshi_image = ""
    if oshi_box:
        img = oshi_box.select_one("img")
        if img:
            oshi_image = img.get("src", "")
            if not oshi_image.startswith("http"):
                oshi_image = BASE_URL + oshi_image
            oshi_card_id = _parse_card_id_from_src(oshi_image)
        p = oshi_box.select_one("p")
        if p:
            oshi_name = p.get_text(strip=True).strip("〈〉")

    main_deck = []
    cheer_deck = []
    card_boxes = block.select(".card-box.list")
    for i, box in enumerate(card_boxes):
        target = main_deck if i == 0 else cheer_deck
        for card_div in box.select(".card"):
            img = card_div.select_one("img")
            num_span = card_div.select_one(".num")
            if not img:
                continue
            src = img.get("src", "")
            if not src.startswith("http"):
                src = BASE_URL + src
            card_id = _parse_card_id_from_src(src)
            count = _parse_count(num_span.get_text()) if num_span else 1
            target.append({
                "card_id": card_id,
                "count": count,
                "imageUrl": src,
            })

    strategy = []
    point_box = block.select_one(".glay-box.point")
    if point_box:
        for div in point_box.select(".attention .txt, .txt"):
            txt = div.get_text(strip=True)
            if txt:
                strategy.append({"text": txt})

    key_cards = []
    for check_box in block.select(".glay-box.check"):
        name_el = check_box.select_one(".detail .name") or check_box.select_one("p")
        name = name_el.get_text(strip=True).strip("\u3008\u3009\u226a\u226b\u300a\u300b") if name_el else ""
        txt_el = check_box.select_one(".detail .attention .txt") or check_box.select_one(".detail .txt")
        txt = txt_el.get_text(strip=True) if txt_el else ""
        card_img = check_box.select_one(".card img") or check_box.select_one("img")
        img_url = ""
        kid = ""
        if card_img:
            img_url = card_img.get("src", "")
            if not img_url.startswith("http"):
                img_url = BASE_URL + img_url
            kid = _parse_card_id_from_src(img_url)
        key_cards.append({"name": name, "card_id": kid, "imageUrl": img_url, "text": txt})

    return {
        "title": title,
        "description": description,
        "url": url,
        "oshi": oshi_name,
        "oshi_card_id": oshi_card_id,
        "oshi_image": oshi_image,
        "main_deck": main_deck,
        "cheer_deck": cheer_deck,
        "main_deck_count": sum(c["count"] for c in main_deck),
        "cheer_deck_count": sum(c["count"] for c in cheer_deck),
        "strategy": strategy,
        "key_cards": key_cards,
    }


def scrape_official(output_dir: Path) -> list[dict]:
    """Scrape all official recommended decks and save to official_decks.json."""
    output_dir.mkdir(parents=True, exist_ok=True)
    print("  Collecting deck URLs from listing pages...")
    entries = _collect_deck_urls()
    print(f"  Found {len(entries)} deck URLs")

    results = []
    for i, entry in enumerate(entries):
        print(f"  [{i+1}/{len(entries)}] {entry['url']}")
        deck = _scrape_deck_page(entry["url"])
        if not deck:
            continue
        deck["date"] = _parse_date(entry.get("date_text", ""))
        deck["source"] = "official"
        slug = entry["url"].rstrip("/").split("/")[-1]
        deck["deck_id"] = f"official-{slug}"
        results.append(deck)
        time.sleep(REQUEST_DELAY)

    out_path = output_dir / "official_decks.json"
    out_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  Saved {len(results)} official decks to {out_path}")
    return results


if __name__ == "__main__":
    scrape_official(Path("data"))
