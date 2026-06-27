"""Scrape event results from bushi-navi.com for hololive OCG.

Four phases, all resumable via `data/bushinavi_state.json`:

  Phase 1 (LIST)   — paginate /api/user/event/result/list
                     → records event_ids + metadata
                     → ~83 API calls (823 events / 10 per page), 2 min with delay
  Phase 2 (DETAIL) — fetch /api/user/event/result/detail/{id} for each event_id
                     → records rankings per event
                     → ~823 API calls, ~15 min with delay
  Phase 3 (DECK)   — fetch each unique deck_code via hocg-deck-convert-api proxy
                     → records main/cheer deck contents
                     → ~6500 API calls (external proxy), ~2.5 hr with delay
                     → Can resume if interrupted; dedup'd against prior runs
  Phase 4 (IMAGE)  — download unique reward PNG URLs to web/images/rewards/
                     → ~200-1000 unique images, ~10 min
                     → Skip already-downloaded files

Outputs:
  web/data/bushinavi_events.json  — per-event with ranked player list
  web/data/bushinavi_decks.json   — deck_code → {main_deck, cheer_deck, ...}
  web/images/rewards/*.png        — reward badges (gitignored, Studio-local)

Safety:
  - Configurable per-phase delay via env (BUSHINAVI_LIST_DELAY, BUSHINAVI_DETAIL_DELAY,
    BUSHINAVI_DECK_DELAY, BUSHINAVI_IMAGE_DELAY). Defaults: 1.0, 1.0, 1.5, 0.5 s.
  - Exponential backoff on 429/5xx.
  - Phase 3 respects --max-decks cap (default 9999) so you can run in chunks.
  - State file records completed work; re-running is idempotent.

Usage:
  python -m scraper.scrape_bushinavi                # run all 4 phases (fresh)
  python -m scraper.scrape_bushinavi --phases 1,2   # just list + details
  python -m scraper.scrape_bushinavi --phases 3 --max-decks 500
  python -m scraper.scrape_bushinavi --reset        # wipe state and start over
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx

from scraper._atomic import atomic_write_json

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API_BASE = "https://api-user.bushi-navi.com"
LIST_ENDPOINT = "/api/user/event/result/list"
DETAIL_ENDPOINT = "/api/user/event/result/detail/{event_id}"
GAME_TITLE_ID = 10  # hololive OCG
PAGE_SIZE = 50  # bigger page = fewer list requests (max accepted: 50)

DECKLOG_PROXY = "https://hocg-deck-convert-api.onrender.com/view-deck"
DECKLOG_PUBLIC_URL = "https://decklog.bushiroad.com/view/{code}"

REQUIRED_HEADERS = {
    "Accept": "application/json",
    "X-Accept-Version": "v1",
    "Origin": "https://www.bushi-navi.com",
    "Referer": "https://www.bushi-navi.com/",
    "User-Agent": "Mozilla/5.0 (compatible; hololive-card-meta/1.0; fan-made non-commercial)",
}

IMAGE_HEADERS = {
    "User-Agent": REQUIRED_HEADERS["User-Agent"],
    "Referer": "https://www.bushi-navi.com/",
}

# Delays (seconds) — override via env
def _delay(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, str(default)))
    except ValueError:
        return default


LIST_DELAY = _delay("BUSHINAVI_LIST_DELAY", 1.0)
DETAIL_DELAY = _delay("BUSHINAVI_DETAIL_DELAY", 1.0)
DECK_DELAY = _delay("BUSHINAVI_DECK_DELAY", 1.5)
IMAGE_DELAY = _delay("BUSHINAVI_IMAGE_DELAY", 0.5)


REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
WEB_DATA_DIR = REPO_ROOT / "web" / "data"
REWARD_IMG_DIR = REPO_ROOT / "web" / "images" / "rewards"
STATE_PATH = DATA_DIR / "bushinavi_state.json"
EVENTS_OUTPUT = WEB_DATA_DIR / "bushinavi_events.json"
DECKS_OUTPUT = WEB_DATA_DIR / "bushinavi_decks.json"


# ─── State management ────────────────────────────────────────────────

def _load_state() -> dict:
    if not STATE_PATH.exists():
        return {"phase1": {"completed": False, "events_known": []},
                "phase2": {"fetched_event_ids": []},
                "phase3": {"fetched_codes": [], "failed_codes": []},
                "phase4": {"downloaded_files": []}}
    return json.loads(STATE_PATH.read_text(encoding="utf-8"))


def _save_state(state: dict) -> None:
    atomic_write_json(STATE_PATH, state)


def _load_events() -> list[dict]:
    if not EVENTS_OUTPUT.exists():
        return []
    return json.loads(EVENTS_OUTPUT.read_text(encoding="utf-8"))


def _save_events(events: list[dict]) -> None:
    # Newest first
    events.sort(key=lambda e: e.get("event_date", ""), reverse=True)
    atomic_write_json(EVENTS_OUTPUT, events)


def _load_decks() -> dict:
    if not DECKS_OUTPUT.exists():
        return {}
    return json.loads(DECKS_OUTPUT.read_text(encoding="utf-8"))


def _save_decks(decks: dict) -> None:
    atomic_write_json(DECKS_OUTPUT, decks)


# ─── HTTP helpers with backoff ────────────────────────────────────────

def _http_get(client: httpx.Client, url: str, params: dict | None = None,
              headers: dict | None = None, tries: int = 4) -> httpx.Response | None:
    h = dict(REQUIRED_HEADERS)
    if headers:
        h.update(headers)
    delay = 2.0
    for attempt in range(tries):
        try:
            r = client.get(url, params=params, headers=h, timeout=30)
        except Exception as e:
            print(f"    [http] attempt {attempt+1} error: {e}")
            time.sleep(delay)
            delay *= 2
            continue
        if r.status_code == 429:
            print(f"    [http] 429 rate limit — sleeping {delay}s")
            time.sleep(delay)
            delay *= 2
            continue
        if 500 <= r.status_code < 600:
            print(f"    [http] {r.status_code} server error — sleeping {delay}s")
            time.sleep(delay)
            delay *= 2
            continue
        return r
    print(f"    [http] gave up after {tries} attempts: {url}")
    return None


# ─── Phase 1: list ────────────────────────────────────────────────────

def phase1_list_events(state: dict) -> list[dict]:
    """Paginate event list, record all event_ids + metadata."""
    print("\n── Phase 1: Listing events ──")
    if state["phase1"]["completed"] and state["phase1"]["events_known"]:
        print(f"  (cached) {len(state['phase1']['events_known'])} events known; skipping")
        return state["phase1"]["events_known"]

    client = httpx.Client(follow_redirects=True)
    try:
        url = API_BASE + LIST_ENDPOINT
        offset = 0
        all_events: list[dict] = []
        total = None
        while True:
            params = {"game_title_id[]": GAME_TITLE_ID, "limit": PAGE_SIZE, "offset": offset}
            r = _http_get(client, url, params=params)
            if not r or r.status_code != 200:
                print(f"  [phase1] list page offset={offset} failed, aborting")
                break
            body = r.json().get("success", {})
            batch = body.get("events", [])
            if total is None:
                total = body.get("total", 0)
                print(f"  total events available: {total}")
            if not batch:
                break
            all_events.extend(batch)
            offset += len(batch)
            print(f"  fetched {offset}/{total}")
            if offset >= total:
                break
            time.sleep(LIST_DELAY)

        state["phase1"]["completed"] = True
        state["phase1"]["events_known"] = all_events
        _save_state(state)
        print(f"  phase 1 complete: {len(all_events)} events recorded")
        return all_events
    finally:
        client.close()


# ─── Phase 2: event details ───────────────────────────────────────────

def _normalize_detail(event_id: int, success: dict) -> dict:
    """Flatten primary_result / grouped_rankings (group→team→members) into a
    rankings list.

    The Bushi-Navi API returns ranking data in one of TWO locations depending
    on the event age/format:
      - `primary_result` : newer events (2025+)
      - `grouped_rankings`: older events (~2024)
    Both use the same inner shape (group_key → team_id → team) so we just
    walk both when populated.
    """
    rankings = []
    seen_team_ids = set()  # dedupe in case both sources carry the same team
    for source_key in ("primary_result", "grouped_rankings"):
        src = success.get(source_key)
        if not isinstance(src, dict):
            continue
        for _group_key, teams in src.items():
            if not isinstance(teams, dict):
                continue
            for team_id, team in teams.items():
                if team_id in seen_team_ids:
                    continue
                seen_team_ids.add(team_id)
                rank = team.get("rank")
                for m in (team.get("team_member") or []):
                    code = m.get("deck_recipe_id") or ""
                    rankings.append({
                        "rank": rank,
                        "player_name": m.get("player_name", ""),
                        "friend_code": m.get("friend_code", ""),
                        "oshi": m.get("deck_param1", ""),
                        "deck_code": code,
                        "decklog_url": DECKLOG_PUBLIC_URL.format(code=code) if code else "",
                        "reward_image_url": m.get("reward_image_url", ""),
                    })
    rankings.sort(key=lambda r: (r.get("rank") or 999))

    ed = success.get("event_detail") or {}
    return {
        "event_id": event_id,
        "series_title": ed.get("series_title", ""),
        "event_title": ed.get("event_title", ""),
        "event_date": (ed.get("start_datetime") or "")[:10],
        "place": ed.get("place", ""),
        "game_format": ed.get("game_format_name", ""),
        "joined_player_count": success.get("joined_player_count"),
        "max_join_count": ed.get("max_join_count"),
        "source_url": f"https://www.bushi-navi.com/event/result/detail/{event_id}",
        "rankings": rankings,
    }


def phase2_fetch_details(state: dict, summaries: list[dict]) -> list[dict]:
    """Fetch detail pages for every event. Resumable via state['phase2']."""
    print("\n── Phase 2: Event details ──")
    done = set(state["phase2"]["fetched_event_ids"])
    pending = [s for s in summaries if s.get("event_id") not in done]
    events = _load_events()
    events_by_id = {e["event_id"]: e for e in events}

    print(f"  pending: {len(pending)}/{len(summaries)} ({len(done)} already fetched)")

    if not pending:
        print("  (all details already fetched)")
        return events

    client = httpx.Client(follow_redirects=True)
    try:
        for i, summary in enumerate(pending):
            event_id = summary["event_id"]
            url = API_BASE + DETAIL_ENDPOINT.format(event_id=event_id)
            r = _http_get(client, url)
            if not r or r.status_code != 200:
                print(f"  [{i+1}/{len(pending)}] {event_id}: fetch failed, will retry next run")
                time.sleep(DETAIL_DELAY)
                continue
            body = r.json().get("success", {})
            detail = _normalize_detail(event_id, body)
            events_by_id[event_id] = detail
            done.add(event_id)

            rank_count = len(detail["rankings"])
            series = detail["series_title"][:30]
            if (i + 1) % 20 == 0 or i < 3:
                print(f"  [{i+1}/{len(pending)}] {event_id} {detail['event_date']} ({rank_count} ranks) {series}")

            # Persist state+events periodically so a Ctrl+C doesn't lose everything
            if (i + 1) % 25 == 0:
                state["phase2"]["fetched_event_ids"] = sorted(done)
                _save_state(state)
                _save_events(list(events_by_id.values()))

            time.sleep(DETAIL_DELAY)

        state["phase2"]["fetched_event_ids"] = sorted(done)
        _save_state(state)
        _save_events(list(events_by_id.values()))
        print(f"  phase 2 complete: {len(events_by_id)} events with details saved")
        return list(events_by_id.values())
    finally:
        client.close()


# ─── Phase 3: deck contents ───────────────────────────────────────────

def _fetch_deck_content(client: httpx.Client, code: str) -> dict | None:
    """Query hocg-deck-convert-api proxy for main/cheer deck of a deck code."""
    for game_title_id in (108, 9):  # try both known IDs (same as scrape_decklog.py)
        try:
            r = client.post(DECKLOG_PROXY, json={"game_title_id": game_title_id, "code": code.lower()}, timeout=30)
        except Exception as e:
            print(f"    [deck] {code}: request error {e}")
            continue
        if r.status_code == 200:
            return r.json()
        if r.status_code == 429:
            print(f"    [deck] {code}: 429 rate limited — sleep 5s")
            time.sleep(5)
    return None


def _build_card_list(raw_cards: list[dict], cards_db: dict) -> list[dict]:
    results = []
    for e in raw_cards:
        cid = e.get("card_number", "")
        info = cards_db.get(cid) or {}
        results.append({
            "card_id": cid,
            "count": e.get("num", 1),
            "name": info.get("name", cid),
            "type": info.get("type", ""),
            "color": info.get("color", ""),
            "imageUrl": info.get("imageUrl", ""),
        })
    return results


def phase3_fetch_decks(state: dict, events: list[dict], cards_db_path: Path, max_decks: int) -> dict:
    """Fetch deck contents for every unique deck_code seen in events."""
    print("\n── Phase 3: Deck contents ──")
    cards_db = {}
    if cards_db_path.exists():
        for c in json.loads(cards_db_path.read_text(encoding="utf-8")):
            cards_db[c["id"]] = c

    decks = _load_decks()
    done = set(state["phase3"]["fetched_codes"]) | set(decks.keys())
    failed = set(state["phase3"]["failed_codes"])

    # Collect every unique deck_code across all events
    all_codes: list[str] = []
    seen_codes: set[str] = set()
    for ev in events:
        for rk in ev.get("rankings", []):
            c = rk.get("deck_code") or ""
            if c and c not in seen_codes:
                seen_codes.add(c)
                all_codes.append(c)

    pending = [c for c in all_codes if c not in done and c not in failed][:max_decks]
    print(f"  total unique codes: {len(all_codes)}, fetched: {len(done)}, failed: {len(failed)}")
    print(f"  this run will fetch up to {len(pending)} (cap={max_decks})")

    if not pending:
        print("  (nothing to do)")
        return decks

    client = httpx.Client(follow_redirects=True)
    try:
        for i, code in enumerate(pending):
            raw = _fetch_deck_content(client, code)
            if raw is None:
                failed.add(code)
                print(f"  [{i+1}/{len(pending)}] {code}: failed")
            else:
                oshi_list = _build_card_list(raw.get("p_list") or [], cards_db)
                main_deck = _build_card_list(raw.get("list") or [], cards_db)
                cheer_deck = _build_card_list(raw.get("sub_list") or [], cards_db)
                decks[code] = {
                    "deck_code": code,
                    "deck_url": DECKLOG_PUBLIC_URL.format(code=code),
                    "oshi_cards": oshi_list,
                    "main_deck": main_deck,
                    "cheer_deck": cheer_deck,
                    "main_deck_count": sum(c.get("count", 0) for c in main_deck),
                    "cheer_deck_count": sum(c.get("count", 0) for c in cheer_deck),
                }
                done.add(code)
                if (i + 1) % 20 == 0 or i < 3:
                    print(f"  [{i+1}/{len(pending)}] {code}: main={decks[code]['main_deck_count']} cheer={decks[code]['cheer_deck_count']}")

            if (i + 1) % 25 == 0:
                state["phase3"]["fetched_codes"] = sorted(done)
                state["phase3"]["failed_codes"] = sorted(failed)
                _save_state(state)
                _save_decks(decks)

            time.sleep(DECK_DELAY)

        state["phase3"]["fetched_codes"] = sorted(done)
        state["phase3"]["failed_codes"] = sorted(failed)
        _save_state(state)
        _save_decks(decks)
        print(f"  phase 3 complete: {len(decks)} decks saved ({len(failed)} failed)")
        return decks
    finally:
        client.close()


# ─── Phase 4: reward images ───────────────────────────────────────────

def _image_local_filename(url: str) -> str:
    """Generate a stable filename from the remote URL (preserves extension)."""
    parsed = urlparse(url)
    path = parsed.path  # /rewards/h_1794/020_hOCG_gold_Kanata.png
    # Hash the path + preserve basename → avoid collisions, keep extension
    h = hashlib.md5(path.encode("utf-8")).hexdigest()[:10]
    basename = Path(path).name or "reward.png"
    # Keep it short but recognizable
    stem = Path(basename).stem[:40]
    ext = Path(basename).suffix or ".png"
    return f"{h}_{stem}{ext}"


def phase4_download_images(state: dict, events: list[dict]) -> list[dict]:
    """Download unique reward PNGs to web/images/rewards/. Rewrites events
    in-place to add a `reward_image_local` field pointing at the saved file.
    """
    print("\n── Phase 4: Reward images ──")
    REWARD_IMG_DIR.mkdir(parents=True, exist_ok=True)
    downloaded = set(state["phase4"]["downloaded_files"])

    # Collect unique URLs
    url_to_local: dict[str, str] = {}
    for ev in events:
        for rk in ev.get("rankings", []):
            u = rk.get("reward_image_url") or ""
            if u and u not in url_to_local:
                url_to_local[u] = _image_local_filename(u)

    to_download = []
    for url, local in url_to_local.items():
        if local in downloaded and (REWARD_IMG_DIR / local).exists():
            continue
        to_download.append((url, local))
    print(f"  unique images: {len(url_to_local)}, need download: {len(to_download)}")

    if to_download:
        client = httpx.Client(follow_redirects=True)
        try:
            for i, (url, local) in enumerate(to_download):
                dest = REWARD_IMG_DIR / local
                r = _http_get(client, url, headers=IMAGE_HEADERS)
                if not r or r.status_code != 200:
                    print(f"  [{i+1}/{len(to_download)}] {url}: failed ({r.status_code if r else 'no response'})")
                    time.sleep(IMAGE_DELAY)
                    continue
                dest.write_bytes(r.content)
                downloaded.add(local)
                if (i + 1) % 50 == 0 or i < 3:
                    print(f"  [{i+1}/{len(to_download)}] {local} ({len(r.content)} bytes)")
                if (i + 1) % 100 == 0:
                    state["phase4"]["downloaded_files"] = sorted(downloaded)
                    _save_state(state)
                time.sleep(IMAGE_DELAY)
            state["phase4"]["downloaded_files"] = sorted(downloaded)
            _save_state(state)
            print(f"  phase 4 complete: {len(downloaded)} images on disk")
        finally:
            client.close()

    # Rewrite events to include reward_image_local paths
    for ev in events:
        for rk in ev.get("rankings", []):
            u = rk.get("reward_image_url") or ""
            if u:
                rk["reward_image_local"] = f"/images/rewards/{url_to_local[u]}"
    _save_events(events)
    print("  events rewritten with local image paths")
    return events


# ─── Orchestrator ─────────────────────────────────────────────────────

def scrape_bushinavi(
    phases: set[int] = frozenset({1, 2, 3, 4}),
    max_decks: int = 9999,
    reset: bool = False,
) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)

    if reset:
        if STATE_PATH.exists():
            STATE_PATH.unlink()
        print("  state file wiped; starting fresh")

    state = _load_state()

    summaries = []
    if 1 in phases:
        summaries = phase1_list_events(state)
    else:
        summaries = state["phase1"].get("events_known", [])

    events: list[dict] = _load_events()
    if 2 in phases:
        events = phase2_fetch_details(state, summaries)

    cards_path = DATA_DIR / "cards.json"
    decks: dict = _load_decks()
    if 3 in phases:
        decks = phase3_fetch_decks(state, events, cards_path, max_decks)

    if 4 in phases:
        events = phase4_download_images(state, events)

    print("\n── Summary ──")
    print(f"  events: {len(events)}")
    print(f"  decks:  {len(decks)}")
    print(f"  state:  {STATE_PATH}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phases", default="1,2,3,4",
                    help="Comma-separated phase numbers to run (default: 1,2,3,4)")
    ap.add_argument("--max-decks", type=int, default=9999,
                    help="Cap on number of decks to fetch this run (Phase 3 only)")
    ap.add_argument("--reset", action="store_true",
                    help="Wipe state file before starting")
    args = ap.parse_args()

    phases = set(int(p) for p in args.phases.split(",") if p.strip())
    scrape_bushinavi(phases=phases, max_decks=args.max_decks, reset=args.reset)


if __name__ == "__main__":
    main()
