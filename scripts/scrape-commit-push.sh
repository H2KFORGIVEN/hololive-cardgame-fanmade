#!/bin/bash
# Manual scrape trigger — runs the full scraper pipeline, then commits + pushes
# any data changes (mirrors what the daily GitHub Actions workflow does, but on
# demand). Use when you want fresh tier/deck/card data RIGHT NOW instead of
# waiting for the 06:00 UTC daily run.
#
# Usage: ./scripts/scrape-commit-push.sh
set -e

cd "$(dirname "$0")/.."

echo "→ Running scrapers (tier / decks / decklog / cards / official / rules / x-posts)..."
uv run python -m scraper.run

echo "→ Checking for data changes..."
if git diff --quiet web/data/ translation_cache.json 2>/dev/null; then
  echo "✓ No data changes — nothing to commit"
  exit 0
fi

echo "→ Committing..."
git add web/data/ translation_cache.json
git commit -m "chore: manual scrape — update data & translation cache"

echo "→ Pushing to GitHub + deploying to Studio..."
./scripts/push-deploy.sh

echo "✓ Done"
