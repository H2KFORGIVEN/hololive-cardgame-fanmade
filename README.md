<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./docs/README.zh-TW.md">繁體中文</a> ·
  <a href="./docs/README.ja.md">日本語</a>
</p>

<p align="center">
  <img src="web/images/brand/logo.svg" alt="hololive OFFICIAL CARD GAME" width="400">
</p>

<h3 align="center">Fan-made Practice Site</h3>

<p align="center">
  A fan-made meta database and online battle simulator for<br>
  <strong>hololive OFFICIAL CARD GAME (hOCG)</strong>
</p>

<p align="center">
  <a href="https://hololive-official-cardgame.com" target="_blank">Official Site</a> ·
  <a href="https://github.com/hololive-cardgame/cards">Card Database</a> ·
  <a href="https://www.holocardstrategy.jp/">ホロカ攻略ギルド</a>
</p>

<p align="center">
  <a href="https://h2kforgiven.github.io/hololive-cardgame-fanmade/">
    <img src="docs/assets/btn-browser.jpg" alt="Open Browser" height="80">
  </a>
  <a href="https://github.com/H2KFORGIVEN/hololive-cardgame-fanmade/releases">
    <img src="docs/assets/btn-macos.jpg" alt="Download macOS" height="80">
  </a>
  <a href="https://github.com/H2KFORGIVEN/hololive-cardgame-fanmade/releases">
    <img src="docs/assets/btn-windows.jpg" alt="Download Windows" height="80">
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/cards-1%2C052-blue?style=flat-square" alt="Cards">
  <img src="https://img.shields.io/badge/effects-1%2C300%2B-green?style=flat-square" alt="Effects">
  <img src="https://img.shields.io/badge/languages-4-orange?style=flat-square" alt="Languages">
  <img src="https://img.shields.io/badge/license-MIT-brightgreen?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/framework-vanilla%20JS-yellow?style=flat-square" alt="Vanilla JS">
</p>

> [!NOTE]
> Card effects are still being fixed and refined. Some effects may not work correctly or may require manual adjustment. Contributions and bug reports are welcome!

---

## Features

### Meta Database

- **Tier Lists** — Deck rankings based on tournament results
- **Deck Guides** — Tournament-winning deck recipes with strategy breakdowns
- **Tournament Data** — Results from official and community tournaments
- **Card Search** — Browse all 1,052 unique cards with filters by color, type, bloom level, tag
- **Rules Tutorial** — Complete rules guide with illustrations
- **Multi-language** — 繁體中文 / English / 日本語 / Français

### Battle Simulator

- **Full Rule Implementation** — All 6 phases: Reset → Draw → Cheer → Main → Performance → End
- **1,300+ Effect Handlers** — Card effects automated with player selection UI
- **Local 2-Player** — Hot-seat play on the same screen
- **Online Multiplayer** — WebSocket-based LAN/internet play with room codes
- **Interactive Tutorial** — 5-lesson guided walkthrough (placement → bloom → collab → art → victory)
- **Pixi.js WebGL FX** — Particle effects, shockwaves, attack beams, sparkles layered over DOM
- **Drag & Drop** — Place members, bloom, equip supports by dragging
- **Deck Selection** — Build from official/tournament deck recipes
- **Dice UI** — Visual dice rolls for effect resolution
- **Damage Animation** — Floating damage numbers, knockdown flash

### Card Effect System

| Layer | Description | Coverage |
|-------|-------------|----------|
| Templates | Pattern-matched handlers (damage boost, search, cheer, etc.) | ~400 cards |
| Card-specific | Hand-written handlers for complex effects | ~600 cards |
| Selection UI | Player choice for search/reveal/archive effects | 70+ prompts |
| Order-to-bottom | Choose card order when returning to deck bottom | 33 cards |
| Manual Adjust | Fallback panel for edge cases | All cards |

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Vanilla ES Modules (no framework, no build step) |
| Game Engine | Pure function state machine `(state, action) → newState` |
| Rendering | DOM + CSS (playsheet-based board layout) |
| VFX | Pixi.js v8 (WebGL overlay, loaded from CDN as ESM) |
| Multiplayer | Node.js + `ws` WebSocket server |
| Data | JSON (cards, decks, tournaments, homepage) |
| Scraping | Python scripts for card data and homepage updates |
| Languages | i18n with runtime locale switching |

---

## Project Structure

```
web/
├── index.html              # Landing page (dynamic from homepage.json)
├── style.css               # Main site styles
├── data/
│   ├── cards.json          # 1,052 unique cards with effects in 4 languages
│   ├── homepage.json       # Banners, products, news (auto-updated)
│   ├── decklog_decks.json  # Tournament deck recipes
│   └── official_decks.json # Official recommended decks
├── game/
│   ├── index.html          # Battle simulator entry
│   ├── game.css            # Game styles
│   ├── GameController.js   # Main controller (local + online modes)
│   ├── core/               # Pure game logic (no DOM)
│   │   ├── GameEngine.js   # State machine
│   │   ├── ActionValidator.js
│   │   ├── DamageCalculator.js
│   │   ├── CardDatabase.js
│   │   ├── EffectResolver.js
│   │   └── SetupManager.js
│   ├── effects/            # Card effect system
│   │   ├── handlers/       # 1,300+ effect handlers across 8 files
│   │   └── registerAll.js  # Master registration
│   ├── ui/                 # UI components
│   ├── tutorial/           # 5-lesson interactive tutorial mode
│   │   ├── TutorialScript.js   # Lesson + step definitions
│   │   ├── TutorialAdapter.js  # Wraps LocalAdapter with action gating
│   │   ├── TutorialOverlay.js  # DOM prompt panel + modals
│   │   └── tutorial-deck.js    # Effect-free Fubuki deck
│   ├── fx/                 # Pixi.js WebGL effect layer
│   │   ├── PixiStage.js    # Fullscreen canvas singleton
│   │   ├── effects.js      # impact / shockwave / sparkle / shatter / ember / flash
│   │   └── beam.js         # Attack beam (attacker → target)
│   ├── net/
│   │   ├── LocalAdapter.js       # Local 2-player
│   │   └── WebSocketAdapter.js   # Online multiplayer
│   └── server/
│       └── ws-server.js    # Authoritative game server
└── images/                 # Card images, banners, brand assets
scripts/
├── update-homepage.py      # Scrape official site for latest content
├── build-images.py         # Process card images
├── enrich-cards.py         # Enrich card data with effects
└── localize-data.py        # Generate multi-language data
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.9

### Install

```bash
git clone https://github.com/H2KFORGIVEN/hololive-cardgame-fanmade.git
cd hololive-cardgame-fanmade
npm install
```

### Run (Local)

```bash
# Start web server
npm run serve
# Open http://localhost:8080
```

### Run (Online Multiplayer)

```bash
# Terminal 1: Start WebSocket server
npm run server

# Terminal 2: Start web server
npm run serve

# Player 1: http://localhost:8080/game/ → Online → Create Room
# Player 2: http://<IP>:8080/game/ → Online → Enter Room Code
```

### Update Homepage Content

```bash
npm run update:homepage
```

### Build (Full Pipeline)

```bash
npm run build
```

---

## Game Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Client A   │◄───►│  WS Server   │◄───►│  Client B   │
│ (Browser)   │ WS  │  (Node.js)   │ WS  │ (Browser)   │
├─────────────┤     ├──────────────┤     ├─────────────┤
│ GameBoard   │     │ GameEngine   │     │ GameBoard   │
│ ActionPanel │     │ EffectSystem │     │ ActionPanel │
│ WS Adapter  │     │ Room Manager │     │ WS Adapter  │
└─────────────┘     │ State Redact │     └─────────────┘
                    └──────────────┘
```

**Server-authoritative**: The server runs `GameEngine`, validates all actions, and broadcasts redacted state to each player (opponent's hand/deck hidden).

**Protocol**: JSON over WebSocket — `JOIN_ROOM`, `SELECT_DECK`, `MULLIGAN_DECISION`, `SETUP_CENTER`, `GAME_ACTION`, `EFFECT_RESPONSE`

---

## How It Works

```
scraper (Python) → JSON data → static frontend (HTML/CSS/JS) → GitHub Pages
```

- **Scraper** fetches card data from [hololive-cardgame/cards](https://github.com/hololive-cardgame/cards) and tier/deck info from [ホロカ攻略ギルド](https://www.holocardstrategy.jp/)
- **GitHub Actions** runs the scraper monthly (and on every push) to keep data fresh
- **Frontend** is vanilla HTML/CSS/JS with an official hololive-themed design
- **Game Engine** is a pure function state machine that runs on both client and server

---

## Roadmap

- [x] Phase 1A — Core battle system (6 phases, all actions)
- [x] Phase 1B — 1,300+ card effect handlers with selection UI
- [x] Phase 1C — Animations, drag & drop, dice UI, damage effects
- [x] Phase 2A — WebSocket online multiplayer with room codes
- [x] Phase 2C — 5-lesson interactive tutorial mode
- [x] Phase 2D — Pixi.js WebGL particle effects layer
- [x] Homepage — Dynamic content from official site (auto-updatable)
- [ ] Phase 2B — Reconnection, spectator mode
- [ ] Phase 3 — Electron desktop app (DMG / EXE)
- [ ] Phase 4 — Cloud server deployment
- [ ] Phase 5 — Unity native port (fan-made, non-commercial; long-term practice experiment)
  - Leverage Unity 6 `com.unity.ai.assistant` MCP for automated Editor workflow
  - Preserve web version for rapid iteration and community demo
  - Reuse existing pure-function engine + card data (migration, not rewrite)
  - Not for sale / not for store distribution — same fan-made disclaimer as the web version applies

---

## Data Sources

- [hololive OFFICIAL CARD GAME](https://hololive-official-cardgame.com) — Official game website
- [hololive-cardgame/cards](https://github.com/hololive-cardgame/cards) — Community card database (1,600+ entries, 4 languages)
- [ホロカ攻略ギルド](https://www.holocardstrategy.jp/) — Strategy, tier lists & tournament data
- [Bushiroad Deck Log](https://decklog-en.bushiroad.com/) — Official deck recipes

---

## Disclaimer

> This is a **fan-made** project for practice and educational purposes.
> Not affiliated with or endorsed by COVER Corp., Bushiroad, or hololive production.
> All card data, images, and game rules are property of their respective owners.
>
> © 2016 COVER Corp. / hololive OFFICIAL CARD GAME

---

<p align="center">
  <sub>Built with vanilla JavaScript — no frameworks, no build tools, just like a real card game: keeping it simple.</sub>
</p>
