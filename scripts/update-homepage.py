#!/usr/bin/env python3
"""
Scrape hololive-official-cardgame.com for latest banners, products, and news.
Outputs web/data/homepage.json and downloads new images.
"""

import json
import os
import re
import ssl
import urllib.request
from pathlib import Path

# Bypass SSL verification (some environments have cert issues)
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

BASE_URL = "https://hololive-official-cardgame.com"
WEB_DIR = Path(__file__).parent.parent / "web"
DATA_FILE = WEB_DIR / "data" / "homepage.json"
BANNERS_DIR = WEB_DIR / "images" / "banners"
PRODUCTS_DIR = WEB_DIR / "images" / "products"
NEWS_DIR = WEB_DIR / "images" / "news"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) hololive-card-meta/1.0"
}


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15, context=SSL_CTX) as resp:
        return resp.read().decode("utf-8", errors="replace")


def download_image(url, dest_dir, filename=None):
    """Download image if not already cached."""
    if not url or not url.startswith("http"):
        return None
    if not filename:
        filename = url.split("/")[-1].split("?")[0]
    # Sanitize filename
    filename = re.sub(r'[^\w.\-]', '_', filename)
    dest = dest_dir / filename
    if dest.exists() and dest.stat().st_size > 0:
        return filename
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15, context=SSL_CTX) as resp:
            dest.write_bytes(resp.read())
        print(f"  Downloaded: {filename}")
    except Exception as e:
        print(f"  Failed to download {url}: {e}")
        return None
    return filename


def scrape_main_page():
    """Scrape the main page for banners."""
    html = fetch(BASE_URL)
    banners = []

    # Find slider/carousel images - look for common patterns
    # The official site uses a slider with large banner images
    # Pattern: <a href="..."><img src="..." ...></a> inside slider
    slider_pattern = re.findall(
        r'<a[^>]*href="([^"]*)"[^>]*>\s*<img[^>]*src="([^"]*)"[^>]*>',
        html, re.DOTALL
    )
    for href, img_src in slider_pattern:
        if "/products/" in href or "/news/" in href:
            if img_src.startswith("http") and any(ext in img_src.lower() for ext in [".jpg", ".png", ".webp"]):
                banners.append({"url": href, "image": img_src})

    return banners[:6]  # Max 6 banners (match official site)


def scrape_products():
    """Scrape the products page."""
    html = fetch(f"{BASE_URL}/products/")
    products = []

    # Find product cards
    blocks = re.findall(
        r'<a[^>]*href="([^"]*products/post/[^"]*)"[^>]*>.*?<img[^>]*src="([^"]*)".*?</a>',
        html, re.DOTALL
    )
    for href, img_src in blocks:
        if not href.startswith("http"):
            href = BASE_URL + href
        # Extract product name from alt or nearby text
        products.append({
            "url": href,
            "image": img_src,
        })

    # Also try to get product names
    name_blocks = re.findall(
        r'href="([^"]*products/post/[^"]*)"[^>]*>.*?<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"',
        html, re.DOTALL
    )
    name_map = {}
    for href, img, alt in name_blocks:
        if not href.startswith("http"):
            href = BASE_URL + href
        name_map[href] = alt

    for p in products:
        p["name"] = name_map.get(p["url"], "")

    return products[:12]


def scrape_news():
    """Scrape the news page."""
    html = fetch(f"{BASE_URL}/news/")
    news = []

    # Find news articles - typically in a list/grid
    articles = re.findall(
        r'<a[^>]*href="([^"]*news/post/[^"]*)"[^>]*>.*?</a>',
        html, re.DOTALL
    )

    for block in articles[:8]:
        url_match = re.search(r'href="([^"]*news/post/\d+[^"]*)"', f'href="{block}"')
        if not url_match:
            continue
        url = block
        if not url.startswith("http"):
            url = BASE_URL + url

        news.append({"url": url})

    # More structured extraction
    news = []
    # Try finding structured news items
    items = re.findall(
        r'<a[^>]*href="((?:https?://[^"]*)?/news/post/\d+/?)"[^>]*>(.*?)</a>',
        html, re.DOTALL
    )
    seen_urls = set()
    for href, content in items:
        if not href.startswith("http"):
            href = BASE_URL + href
        if href in seen_urls:
            continue
        seen_urls.add(href)

        # Extract image
        img_match = re.search(r'<img[^>]*src="([^"]*)"', content)
        img_src = img_match.group(1) if img_match else ""

        # Extract date
        date_match = re.search(r'(\d{4}[./]\d{2}[./]\d{2})', content)
        date = date_match.group(1) if date_match else ""

        # Extract title text (strip HTML tags)
        title_text = re.sub(r'<[^>]+>', ' ', content).strip()
        # Clean up - get the last meaningful line as title
        lines = [l.strip() for l in title_text.split('\n') if l.strip()]
        title = lines[-1] if lines else ""

        # Extract tag/category
        tag = ""
        tag_match = re.search(r'class="[^"]*tag[^"]*"[^>]*>([^<]+)', content)
        if tag_match:
            tag = tag_match.group(1).strip()

        news.append({
            "url": href,
            "image": img_src,
            "date": date,
            "tag": tag,
            "title": title[:80],
        })

    # Max 4 news, mark first as NEW
    news = news[:4]
    if news:
        news[0]["isNew"] = True
    return news


def main():
    os.makedirs(BANNERS_DIR, exist_ok=True)
    os.makedirs(PRODUCTS_DIR, exist_ok=True)
    os.makedirs(NEWS_DIR, exist_ok=True)

    print("Scraping hololive-official-cardgame.com ...")

    # Scrape
    print("\n[Banners]")
    banners = scrape_main_page()
    print(f"  Found {len(banners)} banners")

    print("\n[Products]")
    products = scrape_products()
    print(f"  Found {len(products)} products")

    print("\n[News]")
    news = scrape_news()
    print(f"  Found {len(news)} news items")

    # Download images
    print("\nDownloading images...")
    for i, b in enumerate(banners):
        fname = download_image(b["image"], BANNERS_DIR, f"banner{i+1}.jpg")
        if fname:
            b["localImage"] = f"images/banners/{fname}"

    for i, p in enumerate(products):
        if p["image"]:
            ext = p["image"].split(".")[-1].split("?")[0][:4]
            fname = download_image(p["image"], PRODUCTS_DIR, f"product{i+1}.{ext}")
            if fname:
                p["localImage"] = f"images/products/{fname}"

    for i, n in enumerate(news):
        if n["image"]:
            ext = n["image"].split(".")[-1].split("?")[0][:4]
            fname = download_image(n["image"], NEWS_DIR, f"news{i+1}.{ext}")
            if fname:
                n["localImage"] = f"images/news/{fname}"

    # Build output
    data = {
        "updatedAt": __import__("datetime").datetime.now().isoformat(),
        "banners": banners,
        "products": products,
        "news": news,
    }

    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSaved to {DATA_FILE}")
    print(f"Banners: {len(banners)}, Products: {len(products)}, News: {len(news)}")


if __name__ == "__main__":
    main()
