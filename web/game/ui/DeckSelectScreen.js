import { loadCards, getAllOshi, getAllMembers, getAllSupports, getAllCheers, getCard, getCardImage, localized } from '../core/CardDatabase.js';
import { validateDeck, RESTRICTED_CARDS, NO_LIMIT_CARDS, getMaxCopies } from '../core/DeckBuilder.js';
import { isMember, isSupport, isCheer, isOshi, MAIN_DECK_SIZE, CHEER_DECK_SIZE } from '../core/constants.js';

const deckState = {
  player: 0,
  oshi: null,
  mainDeck: new Map(),
  cheerDeck: new Map(),
  tab: 'oshi',
  search: '',
  colorFilter: 'all',
  bloomFilter: 'all',
  supportFilter: 'all', // all | 工作人員 | 活動 | 道具 | 粉絲 | 吉祥物 | 物品
};

// Recommended pre-built decks.
//
// loadRecommendedDecks() overwrites this list with the top 1/2/3/6 placements
// from the most recent tournament in web/data/decklog_decks.json (called by
// GameController at game start). The hardcoded list below is a fallback for
// offline / fetch-failure cases — gets replaced as soon as the fetch resolves.
let RECOMMENDED_DECKS = [
  {
    id: 'hbp07-divafever',
    name: 'オーロ・クロニー単',
    description: '推薦新手牌組',
    oshi: 'hBP07-005',
    mainDeck: [
      ['hBP07-051', 4], ['hBP07-050', 4], ['hBP01-092', 3], ['hBP07-054', 4],
      ['hBP07-053', 4], ['hBP01-094', 4], ['hBP07-056', 4], ['hBP07-055', 2],
      ['hBP01-104', 4], ['hBP05-080', 4], ['hBP05-074', 1], ['hSD01-018', 1],
      ['hBP07-094', 2], ['hSD01-016', 3], ['hBP07-097', 4], ['hBP07-107', 2],
    ],
    cheerDeck: [['hY04-001', 20]],
  },
];

// Which placements to pull as recommended decks.
const RECOMMENDED_PLACEMENTS = ['1st', '2nd', '3rd', '6th'];

/**
 * Fetch tournaments.json + decklog_decks.json, pick the latest event with
 * enough placements, and rebuild RECOMMENDED_DECKS. Non-fatal — on any error
 * we keep the hardcoded fallback.
 */
export async function loadRecommendedDecks() {
  try {
    const [decklogResp, tournamentsResp] = await Promise.all([
      fetch('../data/decklog_decks.json'),
      fetch('../data/tournaments.json'),
    ]);
    if (!decklogResp.ok || !tournamentsResp.ok) {
      throw new Error(`HTTP ${decklogResp.status}/${tournamentsResp.status}`);
    }
    const [decklog, tournaments] = await Promise.all([
      decklogResp.json(),
      tournamentsResp.json(),
    ]);
    const built = _buildFromLatestTournament(decklog, tournaments);
    if (built && built.length) {
      RECOMMENDED_DECKS = built;
      console.info(`[DeckSelect] Recommended decks: ${built.map(d => d.name).join(', ')}`);
    }
  } catch (e) {
    console.warn('[DeckSelect] Could not load tournament decks, keeping fallback:', e);
  }
}

function _buildFromLatestTournament(decklog, tournaments) {
  // Sort tournaments by date desc. Take the first one that has all the
  // required placements — lets us skip "upcoming" events with no decks.
  const sorted = [...tournaments].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  for (const t of sorted) {
    if (!t.event) continue;
    const eventDecks = decklog.filter(d => d.event === t.event && !d.missing);
    if (eventDecks.length < RECOMMENDED_PLACEMENTS.length) continue;

    const picks = [];
    for (const pfx of RECOMMENDED_PLACEMENTS) {
      const deck = eventDecks.find(d => (d.placement || '').startsWith(pfx));
      if (!deck) break;
      const converted = _convertTournamentDeck(deck, t.event);
      if (!converted) break;
      picks.push(converted);
    }
    if (picks.length === RECOMMENDED_PLACEMENTS.length) return picks;
  }
  return null;
}

function _convertTournamentDeck(deck, eventName) {
  const oshi = deck.oshi_cards?.[0]?.card_id;
  if (!oshi) return null;

  // Deck Log API sometimes returns the same card_id in multiple rows
  // (different "flavors" / upload metadata). Sum counts by id before handing
  // off to the deck builder (game treats same id as interchangeable).
  const agg = (list) => {
    const m = new Map();
    for (const c of list || []) {
      if (!c.card_id) continue;
      m.set(c.card_id, (m.get(c.card_id) || 0) + (c.count || 0));
    }
    return [...m.entries()];
  };

  // Pull the short placement prefix (e.g. "1st(LightningJason)" → "1st").
  const rank = (deck.placement || '').match(/^(\d+(st|nd|rd|th))/)?.[1] || deck.placement || '?';
  const idSlug = `${eventName}-${rank}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');

  return {
    id: `tourn-${idSlug}`,
    name: `${deck.title || deck.oshi || '?'}（${eventName} ${rank}）`,
    description: deck.placement || rank,
    oshi,
    mainDeck: agg(deck.main_deck),
    cheerDeck: agg(deck.cheer_deck),
  };
}

let _onComplete = null;
let _onBack = null;
let _container = null;

export function renderDeckSelect(container, playerNum, onComplete, onBack) {
  deckState.player = playerNum;
  deckState.oshi = null;
  deckState.mainDeck = new Map();
  deckState.cheerDeck = new Map();
  deckState.tab = 'oshi';
  deckState.search = '';
  deckState.colorFilter = 'all';
  deckState.bloomFilter = 'all';
  _onComplete = onComplete;
  _onBack = onBack;
  _container = container;

  render();
}

function render() {
  const container = _container;
  const mainCount = [...deckState.mainDeck.values()].reduce((s, c) => s + c, 0);
  const cheerCount = [...deckState.cheerDeck.values()].reduce((s, c) => s + c, 0);

  container.innerHTML = `
    <div class="deck-select">
      <div class="deck-select-header">
        <div class="deck-header-top">
          ${_onBack ? `<button class="action-btn deck-back-btn" id="deckBackBtn">← 返回</button>` : ''}
          <h2>Player ${deckState.player + 1} - 組建牌組</h2>
          <button class="action-btn deck-clear-btn" id="deckClearBtn">清空牌組</button>
        </div>
        <div class="deck-status">
          <span class="deck-count ${deckState.oshi ? 'count-ok' : ''}">
            推し: ${deckState.oshi ? getCard(deckState.oshi)?.name || '' : '未選擇'}
            ${deckState.oshi ? `<button class="remove-x" data-remove="oshi">✕</button>` : ''}
          </span>
          <span class="deck-count ${mainCount === MAIN_DECK_SIZE ? 'count-ok' : mainCount > MAIN_DECK_SIZE ? 'count-over' : ''}">
            主牌組: ${mainCount}/${MAIN_DECK_SIZE}
          </span>
          <span class="deck-count ${cheerCount === CHEER_DECK_SIZE ? 'count-ok' : cheerCount > CHEER_DECK_SIZE ? 'count-over' : ''}">
            應援: ${cheerCount}/${CHEER_DECK_SIZE}
          </span>
        </div>
        <p class="deck-hint">左鍵加入 ｜ 右鍵移除 ｜ 制限卡(★)最多1張</p>
      </div>

      <div class="deck-tabs">
        ${['oshi', 'member', 'support', 'cheer', 'current'].map(tab => {
          const labels = { oshi: '推しホロメン', member: '成員', support: '支援', cheer: '吶喊', current: `目前牌組 (${mainCount + cheerCount})` };
          return `<button class="deck-tab ${deckState.tab === tab ? 'active' : ''}" data-tab="${tab}">${labels[tab]}</button>`;
        }).join('')}
      </div>

      <div class="deck-filters">
        <input class="deck-search" type="text" placeholder="搜尋卡片名稱/ID..." value="${deckState.search}">
        ${deckState.tab !== 'support' ? `
          <div class="deck-color-filters">
            ${['all', '白', '綠', '紅', '藍', '紫', '黃'].map(c =>
              `<button class="color-filter ${deckState.colorFilter === c ? 'active' : ''}" data-color="${c}">${c === 'all' ? 'ALL' : c}</button>`
            ).join('')}
          </div>
        ` : ''}
        ${deckState.tab === 'member' ? `
          <div class="deck-bloom-filters">
            ${['all', 'Debut', 'Spot', '1st', '2nd'].map(b =>
              `<button class="bloom-filter ${deckState.bloomFilter === b ? 'active' : ''}" data-bloom="${b}">${b === 'all' ? 'ALL' : b}</button>`
            ).join('')}
          </div>
        ` : ''}
        ${deckState.tab === 'support' ? `
          <div class="deck-support-filters">
            ${[
              ['all', '全部'], ['工作人員', '工作人員'], ['活動', '活動'],
              ['道具', '道具'], ['粉絲', '粉絲'], ['吉祥物', '吉祥物'], ['物品', '物品']
            ].map(([k, label]) =>
              `<button class="support-filter ${deckState.supportFilter === k ? 'active' : ''}" data-support="${k}">${label}</button>`
            ).join('')}
          </div>
        ` : ''}
      </div>

      <div class="deck-main-area">
        <div class="deck-card-grid" id="deckCardGrid">
          ${renderCardGrid()}
        </div>

        <aside class="deck-recommended">
          <h4>從 DeckLog 代碼匯入</h4>
          <div class="dl-code-import">
            <input type="text" id="deckLogCodeInput" class="dl-code-input"
                   placeholder="例: 20HL9" maxlength="6" autocomplete="off">
            <button type="button" class="action-btn dl-code-btn" id="deckLogLoadBtn">匯入</button>
            <div class="dl-code-status" id="deckLogStatus"></div>
            <div class="dl-code-hint">貼上 Bushiroad DeckLog 5 碼牌組代碼（例：<code>20HL9</code>）</div>
          </div>
          <h4 class="rec-deck-h4">推薦牌組</h4>
          ${RECOMMENDED_DECKS.map(d => `
            <div class="recommended-deck-item" data-rec-id="${d.id}">
              <div class="rec-deck-name">${d.name}</div>
              <div class="rec-deck-desc">${d.description}</div>
              <button class="action-btn rec-deck-btn" data-rec-load="${d.id}">載入</button>
            </div>
          `).join('')}
        </aside>
      </div>

      <div class="deck-confirm">
        <button class="action-btn action-primary" id="deckConfirmBtn" ${!isDeckValid() ? 'disabled' : ''}>
          確認牌組 ✓
        </button>
        ${!isDeckValid() ? `<span class="deck-valid-hint">${getValidationHint(mainCount, cheerCount)}</span>` : ''}
      </div>
    </div>
  `;

  bindEvents(container);
}

function bindEvents(container) {
  // Back button
  document.getElementById('deckBackBtn')?.addEventListener('click', () => _onBack?.());

  // Clear button
  document.getElementById('deckClearBtn')?.addEventListener('click', () => {
    deckState.oshi = null;
    deckState.mainDeck.clear();
    deckState.cheerDeck.clear();
    render();
  });

  // Remove oshi X button
  container.querySelector('[data-remove="oshi"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    deckState.oshi = null;
    render();
  });

  // Tabs
  container.querySelectorAll('.deck-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      deckState.tab = btn.dataset.tab;
      render();
    });
  });

  // Search
  container.querySelector('.deck-search')?.addEventListener('input', (e) => {
    deckState.search = e.target.value.trim().toLowerCase();
    document.getElementById('deckCardGrid').innerHTML = renderCardGrid();
    bindCardEvents();
  });

  // Color filters
  container.querySelectorAll('.color-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      deckState.colorFilter = btn.dataset.color;
      render();
    });
  });

  // Bloom filters
  container.querySelectorAll('.bloom-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      deckState.bloomFilter = btn.dataset.bloom;
      render();
    });
  });

  // Support subtype filters
  container.querySelectorAll('.support-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      deckState.supportFilter = btn.dataset.support;
      render();
    });
  });

  // Recommended deck load buttons
  container.querySelectorAll('[data-rec-load]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const recId = btn.dataset.recLoad;
      const rec = RECOMMENDED_DECKS.find(d => d.id === recId);
      if (!rec) return;
      deckState.oshi = rec.oshi;
      deckState.mainDeck = new Map(rec.mainDeck);
      deckState.cheerDeck = new Map(rec.cheerDeck);
      deckState.tab = 'current';
      render();
    });
  });

  // DeckLog code import
  const dlInput = document.getElementById('deckLogCodeInput');
  const dlBtn = document.getElementById('deckLogLoadBtn');
  const dlStatus = document.getElementById('deckLogStatus');
  if (dlBtn && dlInput && dlStatus) {
    const trigger = () => _loadFromDeckLogCode(dlInput.value, dlStatus);
    dlBtn.addEventListener('click', trigger);
    dlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); trigger(); }
    });
    // Auto-uppercase as user types — DeckLog codes are case-insensitive but
    // canonicalized uppercase in our data (matches Bushi-Navi conventions)
    dlInput.addEventListener('input', () => {
      dlInput.value = dlInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
  }

  bindCardEvents();

  // Confirm
  document.getElementById('deckConfirmBtn')?.addEventListener('click', () => {
    if (!isDeckValid()) return;
    _onComplete?.({
      oshi: deckState.oshi,
      mainDeck: [...deckState.mainDeck.entries()].map(([cardId, count]) => ({ cardId, count })),
      cheerDeck: [...deckState.cheerDeck.entries()].map(([cardId, count]) => ({ cardId, count })),
    });
  });
}

// ─── DeckLog 5-char code import ───────────────────────────────────────
// Pastes a Bushiroad DeckLog code (e.g. "20HL9"), looks it up via the
// public hocg-deck-convert-api proxy, and populates deckState. Same proxy
// our scrapers use server-side; CORS allows browser access.
//
// Cache strategy: skipped intentionally. Our local decklog_decks.json (52
// entries) and bushinavi_decks.json (~6500) cover only the codes we've
// scraped. The proxy is fast (~1-2s) and supports any valid code, so we
// just always go to it and avoid pulling 4MB of JSON into the page.

const DECKLOG_PROXY_URL = 'https://hocg-deck-convert-api.onrender.com/view-deck';
// Try game_title_id 9 first (current hololive OCG card pool); fall back to
// 108 (older / different region). Mirrors scraper/scrape_decklog.py logic.
const DECKLOG_GAME_IDS = [9, 108];

async function _loadFromDeckLogCode(rawCode, statusEl) {
  const code = (rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{4,6}$/.test(code)) {
    statusEl.textContent = '⚠️ 格式錯誤：應為 4-6 碼英數字';
    statusEl.className = 'dl-code-status err';
    return;
  }

  statusEl.textContent = '⏳ 從 DeckLog 抓取中...';
  statusEl.className = 'dl-code-status loading';

  let raw = null;
  let lastErr = '';
  for (const gid of DECKLOG_GAME_IDS) {
    try {
      const resp = await fetch(DECKLOG_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_title_id: gid, code: code.toLowerCase() }),
      });
      if (resp.ok) {
        raw = await resp.json();
        break;
      }
      // 400 + body "code does not exist" → try next gid
      lastErr = await resp.text().catch(() => `HTTP ${resp.status}`);
    } catch (e) {
      lastErr = e.message || String(e);
    }
  }

  if (!raw) {
    statusEl.textContent = `❌ 找不到牌組代碼「${code}」（${lastErr.slice(0, 80)}）`;
    statusEl.className = 'dl-code-status err';
    return;
  }

  // The proxy sometimes returns split entries for the same card_id (different
  // upload metadata). Aggregate to a {cardId: count} Map.
  const aggregate = (list) => {
    const m = new Map();
    for (const c of list || []) {
      const id = c.card_number;
      const n = Number(c.num) || 0;
      if (!id || !n) continue;
      m.set(id, (m.get(id) || 0) + n);
    }
    return m;
  };

  const oshiMap = aggregate(raw.p_list);
  const mainMap = aggregate(raw.list);
  const cheerMap = aggregate(raw.sub_list);

  if (oshiMap.size === 0) {
    statusEl.textContent = `❌ 此牌組沒有推し卡，無法載入`;
    statusEl.className = 'dl-code-status err';
    return;
  }

  // Take the first oshi (single-oshi decks are the rule; if 2+, user can fix manually)
  const oshiId = [...oshiMap.keys()][0];

  // Validate every cardId exists in our DB; collect any unknowns to warn the user
  const unknowns = [];
  for (const id of [oshiId, ...mainMap.keys(), ...cheerMap.keys()]) {
    if (!getCard(id)) unknowns.push(id);
  }

  // Populate deckState (same shape as recommended-deck loading)
  deckState.oshi = oshiId;
  deckState.mainDeck = mainMap;
  deckState.cheerDeck = cheerMap;
  deckState.tab = 'current';

  const mainTotal = [...mainMap.values()].reduce((s, c) => s + c, 0);
  const cheerTotal = [...cheerMap.values()].reduce((s, c) => s + c, 0);
  const title = raw.title || code;

  if (unknowns.length) {
    statusEl.textContent = `⚠️ ${title}：${mainTotal}+${cheerTotal} 張，有 ${unknowns.length} 張卡 ID 在卡庫找不到（${unknowns.slice(0, 2).join(', ')}…）`;
    statusEl.className = 'dl-code-status warn';
  } else {
    statusEl.textContent = `✅ ${title}：主 ${mainTotal} / 應援 ${cheerTotal}`;
    statusEl.className = 'dl-code-status ok';
  }

  render();
}

function bindCardEvents() {
  _container.querySelectorAll('.deck-card-item').forEach(el => {
    // Left click: add
    el.addEventListener('click', () => {
      const cardId = el.dataset.cardId;
      if (!cardId) return;

      if (deckState.tab === 'oshi') {
        deckState.oshi = deckState.oshi === cardId ? null : cardId;
      } else if (deckState.tab === 'cheer') {
        const current = deckState.cheerDeck.get(cardId) || 0;
        deckState.cheerDeck.set(cardId, current + 1);
      } else if (deckState.tab === 'current') {
        // In current view, left click removes 1
        removeOneCard(cardId);
      } else {
        const current = deckState.mainDeck.get(cardId) || 0;
        const max = getMaxCopies(cardId);
        if (current >= max) return;
        deckState.mainDeck.set(cardId, current + 1);
      }
      render();
    });

    // Right click: remove
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      removeOneCard(el.dataset.cardId);
      render();
    });
  });
}

function removeOneCard(cardId) {
  if (!cardId) return;
  if (deckState.tab === 'oshi' || (getCard(cardId) && isOshi(getCard(cardId).type))) {
    if (deckState.oshi === cardId) deckState.oshi = null;
  } else if (deckState.cheerDeck.has(cardId)) {
    const current = deckState.cheerDeck.get(cardId) || 0;
    if (current > 1) deckState.cheerDeck.set(cardId, current - 1);
    else deckState.cheerDeck.delete(cardId);
  } else if (deckState.mainDeck.has(cardId)) {
    const current = deckState.mainDeck.get(cardId) || 0;
    if (current > 1) deckState.mainDeck.set(cardId, current - 1);
    else deckState.mainDeck.delete(cardId);
  }
}

function renderCardGrid() {
  if (deckState.tab === 'current') return renderCurrentDeck();

  let cards = [];
  if (deckState.tab === 'oshi') cards = getAllOshi();
  else if (deckState.tab === 'member') cards = getAllMembers();
  else if (deckState.tab === 'support') cards = getAllSupports();
  else if (deckState.tab === 'cheer') cards = getAllCheers();

  // Color filter (skip for support tab — supports have no color)
  if (deckState.colorFilter !== 'all' && deckState.tab !== 'support') {
    cards = cards.filter(c => c.color === deckState.colorFilter);
  }
  // Bloom filter (member tab)
  if (deckState.tab === 'member' && deckState.bloomFilter !== 'all') {
    cards = cards.filter(c => c.bloom === deckState.bloomFilter);
  }
  // Support subtype filter
  if (deckState.tab === 'support' && deckState.supportFilter !== 'all') {
    cards = cards.filter(c => c.type === '支援・' + deckState.supportFilter);
  }
  // Search
  if (deckState.search) {
    const q = deckState.search;
    cards = cards.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.id || '').toLowerCase().includes(q) ||
      (c.tag || '').toLowerCase().includes(q)
    );
  }

  // Deduplicate by id
  const seen = new Set();
  const unique = [];
  for (const c of cards) {
    if (!seen.has(c.id)) { seen.add(c.id); unique.push(c); }
  }

  return unique.map(c => {
    const count = deckState.tab === 'cheer'
      ? (deckState.cheerDeck.get(c.id) || 0)
      : (deckState.mainDeck.get(c.id) || 0);
    const isSelected = deckState.tab === 'oshi' && deckState.oshi === c.id;
    const restricted = RESTRICTED_CARDS.has(c.id);
    const max = getMaxCopies(c.id);
    const atMax = count >= max;

    return `
      <div class="deck-card-item ${isSelected ? 'deck-card-selected' : ''} ${atMax && count > 0 ? 'deck-card-maxed' : ''}" data-card-id="${c.id}">
        <img src="${getCardImage(c.id)}" alt="${c.name}" loading="lazy">
        <div class="deck-card-info">
          <div class="deck-card-name">${restricted ? '★ ' : ''}${c.name}</div>
          <div class="deck-card-meta">${c.id} ${c.bloom || ''} ${c.color || ''} ${restricted ? '(制限1)' : ''}</div>
        </div>
        ${count > 0 ? `<div class="deck-card-count">x${count}${max < 4 ? '/' + max : ''}</div>` : ''}
      </div>
    `;
  }).join('') || '<div class="deck-empty-msg">沒有符合條件的卡片</div>';
}

function renderCurrentDeck() {
  let html = '';
  const mainCount = [...deckState.mainDeck.values()].reduce((s, c) => s + c, 0);
  const cheerCount = [...deckState.cheerDeck.values()].reduce((s, c) => s + c, 0);

  if (deckState.oshi) {
    const c = getCard(deckState.oshi);
    html += `<div class="deck-section-label">推しホロメン</div>`;
    html += renderDeckEntry(deckState.oshi, c, 1, true);
  }

  const mainEntries = [...deckState.mainDeck.entries()].filter(([, count]) => count > 0);
  if (mainEntries.length > 0) {
    // Sort by type then name
    mainEntries.sort((a, b) => {
      const ca = getCard(a[0]), cb = getCard(b[0]);
      const ta = ca?.type || '', tb = cb?.type || '';
      if (ta !== tb) return ta.localeCompare(tb);
      return (ca?.name || '').localeCompare(cb?.name || '');
    });
    html += `<div class="deck-section-label">主牌組 (${mainCount}/${MAIN_DECK_SIZE})</div>`;
    for (const [cardId, count] of mainEntries) {
      html += renderDeckEntry(cardId, getCard(cardId), count, false);
    }
  }

  const cheerEntries = [...deckState.cheerDeck.entries()].filter(([, count]) => count > 0);
  if (cheerEntries.length > 0) {
    html += `<div class="deck-section-label">應援牌組 (${cheerCount}/${CHEER_DECK_SIZE})</div>`;
    for (const [cardId, count] of cheerEntries) {
      html += renderDeckEntry(cardId, getCard(cardId), count, false);
    }
  }

  if (!html) {
    html = '<div class="deck-empty-msg">尚未選擇任何卡片<br>左鍵加入 ｜ 右鍵 / 點擊移除</div>';
  }
  return html;
}

function renderDeckEntry(cardId, card, count, isOshi) {
  const restricted = RESTRICTED_CARDS.has(cardId);
  return `
    <div class="deck-card-item deck-card-in-deck" data-card-id="${cardId}">
      <img src="${getCardImage(cardId)}" alt="${card?.name}" loading="lazy">
      <div class="deck-card-info">
        <div class="deck-card-name">${restricted ? '★ ' : ''}${card?.name || cardId}</div>
        <div class="deck-card-meta">${cardId} ${card?.bloom || ''} ${card?.type || ''}</div>
      </div>
      <div class="deck-card-count">${isOshi ? '' : 'x' + count}</div>
    </div>
  `;
}

function isDeckValid() {
  if (!deckState.oshi) return false;
  const mainCount = [...deckState.mainDeck.values()].reduce((s, c) => s + c, 0);
  const cheerCount = [...deckState.cheerDeck.values()].reduce((s, c) => s + c, 0);
  if (mainCount === 0 || mainCount > MAIN_DECK_SIZE) return false;
  if (cheerCount !== CHEER_DECK_SIZE) return false;
  for (const [cardId, count] of deckState.mainDeck) {
    if (count > getMaxCopies(cardId)) return false;
  }
  return true;
}

function getValidationHint(mainCount, cheerCount) {
  const issues = [];
  if (!deckState.oshi) issues.push('選擇推し');
  if (mainCount === 0) issues.push('主牌組需要卡片');
  else if (mainCount > MAIN_DECK_SIZE) issues.push(`主牌組超過 ${MAIN_DECK_SIZE} 張（${mainCount}）`);
  if (cheerCount !== CHEER_DECK_SIZE) issues.push(`應援 ${cheerCount}/${CHEER_DECK_SIZE}`);
  return issues.join(' ｜ ');
}

