# Holo Card Meta

hololive OFFICIAL CARD GAME meta deck database — auto-updated tier list, deck recipes, and full card gallery.

## Live Site

Deployed via GitHub Pages: see the **Environments** tab on this repo.

## How It Works

```
scraper (Python) → JSON data → static frontend (HTML/CSS/JS) → GitHub Pages
```

- **Scraper** fetches card data from [hololive-cardgame](https://github.com/hololive-cardgame/cards) and tier/deck info from [ホロカ攻略ギルド](https://www.holocardstrategy.jp/)
- **GitHub Actions** runs the scraper monthly (and on every push) to keep data fresh
- **Frontend** is vanilla HTML/CSS/JS with a dark hololive-themed design

## Local Development

```bash
# Install dependencies
uv sync

# Run scraper to fetch data
uv run python -m scraper.run

# Serve frontend locally
uv run python -m http.server 8080 --directory web
```

## Data Sources

- Card data: [hololive-cardgame/cards](https://github.com/hololive-cardgame/cards) (Chinese-translated, 1600+ cards)
- Tier list: [ホロカ攻略ギルド](https://www.holocardstrategy.jp/saikyou-deck/)
- Card images: [hololive-cardgame.github.io](https://hololive-cardgame.github.io/cards/)

## Disclaimer

Fan-made project. All card data © 2016 COVER Corp. / hololive OFFICIAL CARD GAME.
