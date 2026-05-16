#!/bin/bash
# Daily X feed refresh — strictly incremental, won't re-pull any tweet we
# already have. Cost in steady state: 0 reads (an empty since_id response
# isn't billed). Only new tweets since the stored last_seen_id cost money.
#
# Runs via Studio launchd at 08:00 CST.
#
# IMPORTANT: this script is the ONLY supported way to refresh x_feed from
# the X API. Do NOT re-run /tmp/merge-x-feed.py (old date-range hardcoded
# tool — deleted). Any other re-pull will waste reads.

set -u
cd "$(dirname "$0")/.." || exit 1

LOG="${HOME}/Library/Logs/x-feed-daily.log"
mkdir -p "$(dirname "$LOG")"
exec >> "$LOG" 2>&1

echo
echo "=== [$(date)] x-feed-daily start ==="

# Single entry point — internally does since_id discovery + feed rebuild
.venv/bin/python -u -m scraper.scrape_x daily
PY_EXIT=$?
echo "scrape_x daily exit=$PY_EXIT"

# Commit if anything changed (x_posts.json gains new URLs, x_feed.json gains entries)
git add x_posts.json web/data/x_feed.json 2>/dev/null
if git diff --cached --quiet 2>/dev/null; then
  echo "no changes to commit"
else
  NEW_URLS=$(git diff --cached -- x_posts.json | grep -cE '^\+[[:space:]]*"https://x\.com' || true)
  git -c commit.gpgsign=false commit -m "cron: x_feed daily refresh (+${NEW_URLS:-0} new tweets)"
  for i in 1 2 3; do
    git pull --rebase origin master && git push origin master && break
    echo "push attempt $i failed, sleep 30s"
    sleep 30
  done
fi

# Budget status
if [ -f data/x_read_counter.json ]; then
  echo "read counter: $(tr -d '\n' < data/x_read_counter.json | tr -s ' ')"
fi

echo "=== [$(date)] x-feed-daily done ==="
