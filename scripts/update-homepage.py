#!/usr/bin/env python3
"""
Scrape hololive-official-cardgame.com homepage for banners, products, and news.
All data is extracted from the main page HTML to match exactly what the official site shows.
Outputs web/data/homepage.json and downloads images locally.
"""

import json
import os
import re
import ssl
import urllib.request
from datetime import datetime
from pathlib import Path

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
    with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as resp:
        return resp.read().decode("utf-8", errors="replace")


def download_image(url, dest_dir, filename):
    """Download image. Returns filename on success."""
    if not url:
        return None
    if not url.startswith("http"):
        url = BASE_URL + url
    dest = dest_dir / filename
    if dest.exists() and dest.stat().st_size > 0:
        return filename
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15, context=SSL_CTX) as resp:
            dest.write_bytes(resp.read())
        print(f"  Downloaded: {filename}")
    except Exception as e:
        print(f"  FAIL: {filename} ({e})")
        return None
    return filename


def full_url(href):
    """Ensure URL is absolute."""
    if href.startswith("http"):
        return href
    return BASE_URL + href


def scrape_homepage():
    """Scrape the main page for banners, products (#top-bnr), and news (#news)."""
    html = fetch(BASE_URL)

    # ── Banners: #keyvisual area — large full-width images ──
    # Look for keyvisual images (2000x1010 banners)
    banners = []
    kv_pattern = re.findall(
        r'<a[^>]*href="([^"]*)"[^>]*>\s*<img[^>]*src="([^"]*2000x1010[^"]*)"',
        html, re.DOTALL
    )
    seen = set()
    for href, img in kv_pattern:
        if img not in seen:
            seen.add(img)
            banners.append({"url": full_url(href), "image": full_url(img)})
    # Fallback: any large banner-like images
    if len(banners) < 3:
        kv2 = re.findall(
            r'<a[^>]*href="([^"]*)"[^>]*>\s*<img[^>]*src="(https://[^"]*(?:bnr_|banner)[^"]*)"',
            html, re.DOTALL
        )
        for href, img in kv2:
            if img not in seen and "2000x1010" not in img:
                seen.add(img)
                banners.append({"url": full_url(href), "image": full_url(img)})
    banners = banners[:6]

    # ── Products: #top-bnr area — 353px slider items ──
    # Server HTML has simple <li><a href><img src></a></li> (no slick attributes)
    products = []
    bnr_match = re.search(r'id="top-bnr"(.*?)</div>', html, re.DOTALL)
    bnr_html = bnr_match.group(1) if bnr_match else ""
    if bnr_html:
        items = re.findall(
            r'<li[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>\s*<img[^>]*src="([^"]*)"',
            bnr_html, re.DOTALL
        )
        seen_img = set()
        for href, img in items:
            if img not in seen_img:
                seen_img.add(img)
                products.append({"url": full_url(href), "image": full_url(img)})
    if not products:
        print("  WARNING: #top-bnr not found or empty, using fallback")
        prod_items = re.findall(
            r'<a[^>]*href="([^"]*products/post/[^"]*)"[^>]*>\s*<img[^>]*src="([^"]*bnr_[^"]*)"',
            html, re.DOTALL
        )
        seen_img = set()
        for href, img in prod_items:
            if img not in seen_img:
                seen_img.add(img)
                products.append({"url": full_url(href), "image": full_url(img)})

    # ── News: #news area — 4 news cards ──
    news = []
    news_match = re.search(r'id="news"(.*?)</section>', html, re.DOTALL)
    news_html = news_match.group(1) if news_match else html

    # Find news <li> items
    news_items = re.findall(
        r'<li[^>]*class="([^"]*)"[^>]*>.*?<a[^>]*href="([^"]*news/post/\d+/?)"[^>]*>(.*?)</a>',
        news_html, re.DOTALL
    )
    if not news_items:
        # Fallback: simpler pattern
        news_items = re.findall(
            r'<a[^>]*href="([^"]*news/post/\d+/?)"[^>]*>(.*?)</a>',
            news_html, re.DOTALL
        )
        news_items = [("", href, content) for href, content in news_items]

    seen_news = set()
    for li_class, href, content in news_items:
        href = full_url(href)
        if href in seen_news:
            continue
        seen_news.add(href)

        is_new = "new" in li_class.split()

        # Image
        img_match = re.search(r'<img[^>]*src="([^"]*)"', content)
        img = full_url(img_match.group(1)) if img_match else ""

        # Date
        date_match = re.search(r'(\d{4}[./]\d{2}[./]\d{2})', content)
        date = date_match.group(1).replace("/", ".") if date_match else ""

        # Category
        cat = ""
        cat_match = re.search(r'class="category[^"]*?\s*(\w+)"', content)
        if cat_match:
            cat = cat_match.group(1).capitalize()
        if not cat:
            # Try <p> inside category div
            cat_p = re.search(r'class="category[^"]*"[^>]*>.*?<p[^>]*>([^<]+)', content, re.DOTALL)
            if cat_p:
                cat = cat_p.group(1).strip()

        # Title
        title = ""
        text_match = re.search(r'class="text"[^>]*>([^<]+)', content)
        if text_match:
            title = text_match.group(1).strip()
        if not title:
            # Fallback: last meaningful text
            texts = re.sub(r'<[^>]+>', '\n', content).strip().split('\n')
            texts = [t.strip() for t in texts if t.strip() and len(t.strip()) > 5]
            title = texts[-1] if texts else ""

        news.append({
            "url": href,
            "image": img,
            "date": date,
            "tag": cat,
            "title": title[:100],
            "isNew": is_new,
        })

    news = news[:4]
    # If no item has isNew, mark the first one
    if news and not any(n.get("isNew") for n in news):
        news[0]["isNew"] = True

    return banners, products, news


def main():
    os.makedirs(BANNERS_DIR, exist_ok=True)
    os.makedirs(PRODUCTS_DIR, exist_ok=True)
    os.makedirs(NEWS_DIR, exist_ok=True)

    print("Scraping hololive-official-cardgame.com ...")

    banners, products, news = scrape_homepage()

    print(f"\n[Results] Banners: {len(banners)}, Products: {len(products)}, News: {len(news)}")

    # Download images
    print("\nDownloading images...")
    for i, b in enumerate(banners):
        ext = b["image"].split(".")[-1].split("?")[0][:4]
        fname = download_image(b["image"], BANNERS_DIR, f"banner{i+1}.{ext}")
        if fname:
            b["localImage"] = f"images/banners/{fname}"

    for i, p in enumerate(products):
        ext = p["image"].split(".")[-1].split("?")[0][:4]
        fname = download_image(p["image"], PRODUCTS_DIR, f"bnr_product{i+1}.{ext}")
        if fname:
            p["localImage"] = f"images/products/{fname}"

    for i, n in enumerate(news):
        if n.get("image"):
            ext = n["image"].split(".")[-1].split("?")[0][:4]
            fname = download_image(n["image"], NEWS_DIR, f"news{i+1}.{ext}")
            if fname:
                n["localImage"] = f"images/news/{fname}"

    # Output
    data = {
        "updatedAt": datetime.now().isoformat(),
        "banners": banners,
        "products": products,
        "news": news,
    }

    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSaved to {DATA_FILE}")
    print(f"  Banners: {len(banners)}")
    print(f"  Products: {len(products)}")
    print(f"  News: {len(news)}")
    for i, n in enumerate(news):
        print(f"    {i+1}. [{n.get('tag','')}] {n.get('title','')[:50]} {'[NEW]' if n.get('isNew') else ''}")


if __name__ == "__main__":
    main()
