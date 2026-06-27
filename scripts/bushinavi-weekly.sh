#!/bin/bash
# Weekly Bushi-Navi incremental scrape — picks up NEW events published since
# the last run. Phases 1-4 are all resumable via data/bushinavi_state.json,
# so already-scraped events/decks/images are skipped.
#
# Costs zero $ (no paid APIs). Uses ~1-2 min of bushi-navi API, decklog proxy,
# and files.bushi-navi.com image CDN — all public endpoints.
#
# Runs via Studio launchd, Mondays at 09:00 CST.

set -u
cd "$(dirname "$0")/.." || exit 1

LOG="${HOME}/Library/Logs/bushinavi-weekly.log"
mkdir -p "$(dirname "$LOG")"
exec >> "$LOG" 2>&1

echo
echo "═════════════════════════════════════════"
echo "=== [$(date)] bushinavi-weekly start ==="
echo "═════════════════════════════════════════"

# Phase 1 is cached in state; we force-reset just the 'completed' flag so
# the list endpoint gets re-scanned for NEW events each week. Details are
# still skipped for events we already have.
python3 -c "
import json
from pathlib import Path
p = Path('data/bushinavi_state.json')
if p.exists():
    s = json.loads(p.read_text(encoding='utf-8'))
    s.setdefault('phase1', {}).update({'completed': False})
    p.write_text(json.dumps(s, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('phase1.completed flag reset; details/decks/images still cached')
"

# Run all four phases — each skips work already done.
.venv/bin/python -u -m scraper.scrape_bushinavi --phases 1,2,3,4
PY_EXIT=$?
echo "scrape_bushinavi exit=$PY_EXIT"

# Commit any new events/decks
git add web/data/bushinavi_events.json web/data/bushinavi_decks.json 2>/dev/null
if git diff --cached --quiet 2>/dev/null; then
  echo "no data changes to commit"
else
  # Count adds for the commit message
  STATS=$(python3 -c "
import json
ev = json.load(open('web/data/bushinavi_events.json'))
dk = json.load(open('web/data/bushinavi_decks.json'))
total_rank = sum(len(e.get('rankings', [])) for e in ev)
print(f'events={len(ev)} decks={len(dk)} rankings={total_rank}')
")
  REWARDS=$(ls web/images/rewards/ 2>/dev/null | wc -l | tr -d ' ')

  git -c commit.gpgsign=false commit -m "cron: bushinavi weekly refresh ($STATS, ${REWARDS} reward imgs)"

  for i in 1 2 3; do
    git pull --rebase origin master && git push origin master && break
    echo "push attempt $i failed, sleep 30s"
    sleep 30
  done
fi

echo "=== [$(date)] bushinavi-weekly done ==="
