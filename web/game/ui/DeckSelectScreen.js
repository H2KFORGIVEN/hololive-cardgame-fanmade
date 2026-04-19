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
          <h4>推薦牌組</h4>
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

