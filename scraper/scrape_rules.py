"""Scrape official rule articles from hololive-official-cardgame.com/cat_news/rule/."""

import re
import time
import json
from datetime import datetime
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

BASE_URL = "https://hololive-official-cardgame.com"
RULE_LIST_URL = f"{BASE_URL}/cat_news/rule/"
DECK_RULES_SLUG = "rule01"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; HoloCardMeta/1.0)"}
REQUEST_DELAY = 1.5

CARD_ID_RE = re.compile(r"h[A-Z]{1,4}\d{2}-\d{3}")


def _fetch(url: str) -> str | None:
    try:
        resp = httpx.get(url, timeout=30, follow_redirects=True, headers=HEADERS)
        if resp.status_code == 200:
            return resp.text
    except httpx.HTTPError as e:
        print(f"  [WARN] Failed to fetch {url}: {e}")
    return None


def _collect_rule_urls() -> list[dict]:
    """Crawl the rule listing page and extract article links with dates."""
    html = _fetch(RULE_LIST_URL)
    if not html:
        return []

    soup = BeautifulSoup(html, "lxml")
    results = []

    for a_tag in soup.select("a[href]"):
        href = a_tag["href"]
        if "/news/post/" not in href:
            continue
        text = a_tag.get_text(" ", strip=True)
        if "Rule" not in text:
            continue

        if not href.startswith("http"):
            href = BASE_URL + href

        date_m = re.search(r"(\d{4})\.(\d{2})\.(\d{2})", text)
        date_str = f"{date_m.group(1)}-{date_m.group(2)}-{date_m.group(3)}" if date_m else ""

        slug = href.rstrip("/").split("/")[-1]
        results.append({"url": href, "date": date_str, "slug": slug})

    seen = set()
    unique = []
    for r in results:
        if r["url"] not in seen:
            seen.add(r["url"])
            unique.append(r)
    return unique


def _classify_article(title: str, slug: str) -> str:
    """Determine article type from title text."""
    if slug == DECK_RULES_SLUG:
        return "deck_rules"
    if "裁定変更" in title:
        return "errata"
    if "制限カード解除" in title and "追加" not in title:
        return "unrestricted"
    if "制限カード" in title:
        return "restricted"
    return "rule_update"


def _parse_restricted_cards(soup: BeautifulSoup) -> list[str]:
    """Extract the current restricted card IDs from the deck building rules page.

    Parses the first restriction table/section which represents the current
    active restrictions (the most recent date block).
    """
    body_text = soup.get_text(" ", strip=False)

    current_section = ""
    latest_date_marker = None
    for el in soup.select(".article-inner, .post-content, .news-detail, article, .entry-content, body"):
        current_section = el.get_text(" ", strip=False)
        if current_section:
            break

    ids_after_latest = []

    sections = re.split(r"(制限カード)", current_section)
    if not sections:
        return CARD_ID_RE.findall(body_text)

    first_block_end = current_section.find("まで適用")
    if first_block_end == -1:
        first_block_end = current_section.find("より適用")

    if first_block_end != -1:
        first_block = current_section[:first_block_end]
        second_block = current_section[first_block_end:]
        first_ids = CARD_ID_RE.findall(first_block)
        if first_ids:
            return list(dict.fromkeys(first_ids))

    return list(dict.fromkeys(CARD_ID_RE.findall(body_text)))


def _scrape_article(url: str) -> dict | None:
    """Scrape a single rule article page."""
    html = _fetch(url)
    if not html:
        return None

    soup = BeautifulSoup(html, "lxml")

    h1 = soup.find("h1")
    title = h1.get_text(strip=True) if h1 else ""

    body_el = (
        soup.select_one(".article-inner")
        or soup.select_one(".post-content")
        or soup.select_one(".news-detail")
        or soup.select_one("article")
        or soup.find("body")
    )
    body_text = body_el.get_text(" ", strip=True) if body_el else ""

    card_ids = list(dict.fromkeys(CARD_ID_RE.findall(body_text)))

    return {"title": title, "body_text": body_text, "card_ids": card_ids, "soup": soup}


def _build_errata_map(articles: list[dict]) -> dict:
    """Build a mapping of card_id -> errata info from errata-type articles."""
    errata = {}
    for art in articles:
        if art["type"] != "errata":
            continue
        for cid in art.get("card_ids", []):
            if cid not in errata:
                errata[cid] = {
                    "date": art["date"],
                    "url": art["url"],
                    "title": art["title"],
                }
    return errata


def scrape_rules(output_dir: Path) -> dict:
    """Scrape all official rule articles and output rules.json."""
    output_dir.mkdir(parents=True, exist_ok=True)

    print("  Collecting rule article URLs...")
    entries = _collect_rule_urls()
    print(f"  Found {len(entries)} rule articles")

    articles = []
    restricted_cards: list[str] = []

    for i, entry in enumerate(entries):
        print(f"  [{i+1}/{len(entries)}] {entry['url']}")
        result = _scrape_article(entry["url"])
        if not result:
            continue

        art_type = _classify_article(result["title"], entry["slug"])

        if entry["slug"] == DECK_RULES_SLUG:
            restricted_cards = _parse_restricted_cards(result["soup"])
            print(f"    Current restricted cards: {restricted_cards}")

        article = {
            "url": entry["url"],
            "date": entry["date"],
            "slug": entry["slug"],
            "title": result["title"],
            "type": art_type,
            "card_ids": result["card_ids"],
        }
        articles.append(article)
        time.sleep(REQUEST_DELAY)

    errata_map = _build_errata_map(articles)

    rules_data = {
        "scraped_at": datetime.now().strftime("%Y-%m-%d"),
        "restricted_cards": restricted_cards,
        "errata": errata_map,
        "articles": articles,
    }

    out_path = output_dir / "rules.json"
    out_path.write_text(json.dumps(rules_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  Saved rules to {out_path}")
    print(f"  Restricted: {len(restricted_cards)} cards | Errata: {len(errata_map)} cards | Articles: {len(articles)}")
    return rules_data


if __name__ == "__main__":
    scrape_rules(Path("data"))
