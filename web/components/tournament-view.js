import { t, getLang } from '../i18n.js';

const KNOWN_WGP_EVENTS = [
  { event: 'WGP2025 Tokyo',               date: '2025-05-05', location: 'Tokyo Big Sight' },
  { event: 'WGP2025 Nagoya',              date: '2025-08-17', location: 'Portmesse Nagoya' },
  { event: 'WGP2025 Chiba',               date: '2025-09-15', location: 'Makuhari Messe' },
  { event: 'WGP25-26 Aichi',              date: '2026-02-08', location: 'Aichi Sky Expo' },
  { event: 'WGP25-26 Taipei',             date: '2026-03-14', location: 'Taipei International Convention Center' },
  { event: 'WGP25-26 Kuala Lumpur',       date: '2026-04-19', location: 'World Trade Centre KL' },
  { event: 'WGP25-26 Fukuoka',            date: '2026-05-10', location: 'Kitakyushu Messe' },
];

const USAGE_RATE_DATA = {
  'WGP2025 Chiba': {
    scope: { 'zh-TW': '預選ラウンド 約2000人', en: 'Qualifier ~2000 players', ja: '予選ラウンド 約2000人', fr: 'Qualifications ~2000 joueurs' },
    source: 'hololive OFFICIAL CARD GAME X (@hololive_OCG)',
    rates: [
      { oshi: 'クレイジー・オリー', pct: 25 },
      { oshi: '天音かなた', pct: 23 },
      { oshi: '紫咲シオン', pct: 9 },
      { oshi: '小鳥遊キアラ', pct: 8 },
      { oshi: '沙花叉クロヱ', pct: 8 },
      { oshi: '星街すいせい', pct: 6 },
      { oshi: '宝鐘マリン', pct: 6 },
      { oshi: 'その他', pct: 15 },
    ],
  },
  'WGP25-26 Aichi': {
    scope: { 'zh-TW': '全勝者 47人', en: 'Undefeated 47 players', ja: '予選全勝者 47人', fr: 'Invaincus 47 joueurs' },
    source: 'wasshoi (note.com)',
    rates: [
      { oshi: '戌神ころね', pct: 38 },
      { oshi: '百鬼あやめ', pct: 21 },
      { oshi: '風真いろは', pct: 13 },
      { oshi: '兎田ぺこら', pct: 6 },
      { oshi: '森カリオペ', pct: 6 },
      { oshi: 'その他', pct: 16 },
    ],
  },
  'WGP25-26 Taipei': {
    scope: { 'zh-TW': '預選ラウンド', en: 'Qualifier Round', ja: '予選ラウンド', fr: 'Qualifications' },
    source: 'hololive OFFICIAL CARD GAME',
    rates: [
      { oshi: 'AZKi', pct: 22 },
      { oshi: '角巻わため', pct: 9 },
      { oshi: '風真いろは', pct: 8 },
      { oshi: '百鬼あやめ', pct: 8 },
      { oshi: '赤井はあと', pct: 7 },
      { oshi: '戌神ころね', pct: 5 },
      { oshi: '森カリオペ', pct: 4 },
      { oshi: '桃鈴ねね', pct: 3 },
      { oshi: '古石ビジュー', pct: 3 },
      { oshi: 'その他', pct: 31 },
    ],
  },
};

const USAGE_COLORS = [
  '#00c8ff', '#ff6b9d', '#ffd93d', '#6bcb77',
  '#9b59b6', '#ff8c42', '#45b7d1', '#96ceb4',
];

export function renderTournamentView(container, decklogDecks, cardsData) {
  const cardsMap = {};
  if (cardsData) {
    for (const c of cardsData) cardsMap[c.id] = c;
  }

  const grouped = {};

  if (decklogDecks?.length) {
    for (const deck of decklogDecks) {
      const key = deck.event || deck.source || 'Other';
      if (!grouped[key]) grouped[key] = { decks: [], date: deck.event_date || '' };
      grouped[key].decks.push(deck);
    }
  }

  for (const known of KNOWN_WGP_EVENTS) {
    if (!grouped[known.event]) {
      grouped[known.event] = { decks: [], date: known.date, location: known.location };
    }
    if (!grouped[known.event].location) {
      grouped[known.event].location = known.location;
    }
  }

  const _placementOrder = (p) => {
    if (!p) return 999;
    if (p.startsWith('1st') || p.startsWith('Trio 1st')) return 1;
    if (p.startsWith('2nd') || p.startsWith('Trio 2nd')) return 2;
    if (p.startsWith('3rd') || p.startsWith('Trio 3rd')) return 3;
    if (p.includes('Undefeated')) return 0;
    const m = p.match(/(\d+)/);
    return m ? parseInt(m[1]) : 500;
  };

  const sortedEvents = Object.entries(grouped)
    .sort((a, b) => (b[1].date || '').localeCompare(a[1].date || ''));

  for (const [, g] of sortedEvents) {
    g.decks.sort((a, b) => _placementOrder(a.placement) - _placementOrder(b.placement));
  }

  let html = `
    <div class="tournament-header">
      <h2 class="tournament-title">${t('tournament_title')}</h2>
      <p class="tournament-desc">${t('tournament_desc')}</p>
    </div>
  `;

  const today = new Date().toISOString().slice(0, 10);
  const usageRendered = new Set();

  for (const [event, { decks, date, location }] of sortedEvents) {
    const isUpcoming = date > today;
    const statusBadge = isUpcoming
      ? `<span class="tournament-event-status upcoming">${t('tournament_upcoming')}</span>`
      : '';

    const locationHtml = location
      ? `<span class="tournament-event-location">${location}</span>`
      : '';

    const usageKey = _findUsageKey(event);
    let usageHtml = '';
    if (usageKey && !usageRendered.has(usageKey)) {
      usageRendered.add(usageKey);
      usageHtml = _renderUsageChart(USAGE_RATE_DATA[usageKey]);
    }

    html += `
      <section class="tournament-event-section${isUpcoming ? ' upcoming-event' : ''}">
        <div class="tournament-event-header">
          <span class="tournament-event-name">${event}</span>
          ${date ? `<span class="tournament-event-date">${date}</span>` : ''}
          ${locationHtml}
          ${statusBadge}
          ${decks.length ? `<span class="tournament-event-count">${decks.length} ${t('decks_count')}</span>` : ''}
        </div>
        ${usageHtml}
        ${decks.length
          ? `<div class="tournament-deck-grid">${decks.map(deck => renderTournamentDeckCard(deck, cardsMap)).join('')}</div>`
          : `<div class="tournament-no-deck-placeholder">${isUpcoming ? t('tournament_upcoming_msg') : t('tournament_no_deck_data')}</div>`
        }
      </section>
    `;
  }

  container.innerHTML = html;
}

function _findUsageKey(eventName) {
  for (const key of Object.keys(USAGE_RATE_DATA)) {
    if (eventName === key || eventName.startsWith(key + ' -')) return key;
  }
  return null;
}

function _renderUsageChart(data) {
  const lang = getLang();
  const scope = data.scope[lang] || data.scope['en'] || '';
  const maxPct = Math.max(...data.rates.map(r => r.pct));

  const bars = data.rates.map((r, i) => {
    const color = USAGE_COLORS[i % USAGE_COLORS.length];
    const width = Math.max((r.pct / maxPct) * 100, 2);
    return `
      <div class="usage-bar-row">
        <span class="usage-bar-label">${r.oshi}</span>
        <div class="usage-bar-track">
          <div class="usage-bar-fill" style="width:${width}%;background:${color}">
            <span class="usage-bar-pct">${r.pct}%</span>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <details class="usage-chart-wrapper" open>
      <summary class="usage-chart-title">${t('tournament_usage_rate')}<span class="usage-chart-scope">${scope}</span></summary>
      <div class="usage-chart-bars">${bars}</div>
      <div class="usage-chart-source">${t('tournament_source')}: ${data.source}</div>
    </details>`;
}

function renderTournamentDeckCard(deck, cardsMap) {
  if (deck.missing) {
    const placementHtml = deck.placement
      ? `<span class="tournament-placement">${deck.placement}</span>`
      : '';
    return `
      <div class="tournament-deck-card missing-deck">
        <div class="tournament-deck-top">
          <div class="tournament-oshi-placeholder missing-placeholder">?</div>
          <div class="tournament-deck-info">
            <div class="tournament-deck-name">${t('tournament_missing_deck')}</div>
            ${placementHtml}
          </div>
        </div>
        <div class="tournament-deck-stats">
          <span class="missing-deck-note">${t('tournament_missing_deck_note')}</span>
        </div>
      </div>
    `;
  }

  const oshiCard = deck.oshi_cards?.[0];
  const oshiInfo = oshiCard ? cardsMap[oshiCard.card_id] : null;
  const oshiImage = oshiInfo?.imageUrl || '';

  const placementHtml = deck.placement
    ? `<span class="tournament-placement">${deck.placement}</span>`
    : '';

  return `
    <div class="tournament-deck-card" data-decklog-id="${deck.deck_id}">
      <div class="tournament-deck-top">
        ${oshiImage ? `<img class="tournament-oshi-img" src="${oshiImage}" alt="${deck.oshi}" loading="lazy">` : '<div class="tournament-oshi-placeholder"></div>'}
        <div class="tournament-deck-info">
          <div class="tournament-deck-name">${deck.title}</div>
          <div class="tournament-deck-oshi">${deck.oshi}</div>
          ${placementHtml}
        </div>
      </div>
      <div class="tournament-deck-stats">
        <span>${t('tournament_main_deck')}: ${deck.main_deck_count} ${t('tournament_cards')}</span>
        <span>${t('tournament_cheer_deck')}: ${deck.cheer_deck_count} ${t('tournament_cards')}</span>
      </div>
    </div>
  `;
}

export function renderTournamentDeckModal(container, decklogId, decklogDecks, cardsData) {
  const deck = decklogDecks?.find(d => d.deck_id === decklogId);
  if (!deck) {
    container.innerHTML = `<p>${t('deck_not_found')}</p>`;
    return;
  }

  const cardsMap = {};
  if (cardsData) {
    for (const c of cardsData) cardsMap[c.id] = c;
  }

  const oshiHtml = deck.oshi_cards?.length
    ? renderCardSection(t('tournament_oshi_card'), deck.oshi_cards, cardsMap)
    : '';

  const mainHtml = deck.main_deck?.length
    ? renderCardSection(t('tournament_main_deck') + ` (${deck.main_deck_count})`, deck.main_deck, cardsMap)
    : '';

  const cheerHtml = deck.cheer_deck?.length
    ? renderCardSection(t('tournament_cheer_deck') + ` (${deck.cheer_deck_count})`, deck.cheer_deck, cardsMap)
    : '';

  container.innerHTML = `
    <div class="modal-deck-header">
      <div class="modal-deck-title">${deck.title}</div>
      <div class="modal-deck-meta">
        <span class="tournament-oshi-badge">${deck.oshi}</span>
        ${deck.event ? `<span class="tournament-event-badge">${deck.event}</span>` : ''}
        ${deck.placement ? `<span class="tournament-placement-badge">${deck.placement}</span>` : ''}
      </div>
    </div>
    ${oshiHtml}
    ${mainHtml}
    ${cheerHtml}
    ${deck.url ? `
      <div class="modal-section" style="padding-bottom:2rem">
        <a class="modal-source-link" href="${deck.url}" target="_blank" rel="noopener">
          ${t('tournament_view_decklog')}
        </a>
      </div>
    ` : ''}
  `;
}

function renderCardSection(title, cards, cardsMap) {
  const cardsHtml = cards.map(c => {
    const info = cardsMap[c.card_id] || {};
    const imageUrl = info.imageUrl || c.imageUrl || '';
    const name = info.name || c.name || c.card_id;
    return `
      <div class="dl-card-entry clickable-card" data-card-id="${c.card_id || ''}">
        ${imageUrl ? `<img class="dl-card-img" src="${imageUrl}" alt="${name}" loading="lazy">` : '<div class="dl-card-placeholder"></div>'}
        <div class="dl-card-info">
          <div class="dl-card-name">${name}</div>
          <div class="dl-card-id">${c.card_id}</div>
          ${c.count > 1 ? `<div class="dl-card-count">x${c.count}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="modal-section">
      <div class="modal-section-title">${title}</div>
      <div class="dl-card-grid">
        ${cardsHtml}
      </div>
    </div>
  `;
}
