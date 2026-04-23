import { t, getLang } from '../i18n.js';
import { escape as _e } from './_escape.js';

// Tournament metadata (events + usage rates) is loaded from
// /data/tournaments.json via the admin UI at /admin/tournaments.html.
// Callers pass the parsed array in as the `tournamentsData` parameter.
//
// All interpolations of scraped / admin-entered strings MUST go through _e()
// — event names, deck titles, oshi names, scope text, source URLs, etc. can
// all contain HTML / script tags from their upstream sources.

const USAGE_COLORS = [
  '#9b51e0', '#ff6b9d', '#ffd93d', '#6bcb77',
  '#9b59b6', '#ff8c42', '#45b7d1', '#96ceb4',
];

export function renderTournamentView(container, decklogDecks, cardsData, tournamentsData) {
  const tournaments = tournamentsData || [];
  const usageByEvent = {};
  for (const entry of tournaments) {
    if (entry.usage_rate) usageByEvent[entry.event] = entry.usage_rate;
  }

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

  for (const known of tournaments) {
    if (!grouped[known.event]) {
      grouped[known.event] = { decks: [], date: known.date || '', location: known.location || '' };
    }
    if (!grouped[known.event].location && known.location) {
      grouped[known.event].location = known.location;
    }
  }

  const _placementOrder = (p) => {
    p = String(p || '');
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
      ? `<span class="tournament-event-location">${_e(location)}</span>`
      : '';

    const usageKey = _findUsageKey(event, usageByEvent);
    let usageHtml = '';
    if (usageKey && !usageRendered.has(usageKey)) {
      usageRendered.add(usageKey);
      usageHtml = _renderUsageChart(usageByEvent[usageKey]);
    }

    const COLLAPSE_THRESHOLD = 6;
    const isCollapsible = decks.length > COLLAPSE_THRESHOLD;
    const gridClass = `tournament-deck-grid${isCollapsible ? ' decks-collapsed' : ''}`;
    const expandBtnHtml = isCollapsible
      ? `<button type="button" class="tournament-expand-btn">${t('tournament_expand_decks', { n: decks.length - COLLAPSE_THRESHOLD })}</button>`
      : '';

    html += `
      <section class="tournament-event-section${isUpcoming ? ' upcoming-event' : ''}">
        <div class="tournament-event-header">
          <span class="tournament-event-name">${_e(event)}</span>
          ${date ? `<span class="tournament-event-date">${_e(date)}</span>` : ''}
          ${locationHtml}
          ${statusBadge}
          ${decks.length ? `<span class="tournament-event-count">${decks.length} ${t('decks_count')}</span>` : ''}
        </div>
        ${usageHtml}
        ${decks.length
          ? `<div class="${gridClass}">${decks.map(deck => renderTournamentDeckCard(deck, cardsMap)).join('')}</div>${expandBtnHtml}`
          : `<div class="tournament-no-deck-placeholder">${isUpcoming ? t('tournament_upcoming_msg') : t('tournament_no_deck_data')}</div>`
        }
      </section>
    `;
  }

  container.innerHTML = html;
}

function _findUsageKey(eventName, usageByEvent) {
  const en = String(eventName || '');
  for (const key of Object.keys(usageByEvent)) {
    if (en === key || en.startsWith(key + ' -')) return key;
  }
  return null;
}

function _renderUsageChart(data) {
  const lang = getLang();
  const scope = (data.scope && (data.scope[lang] || data.scope['en'])) || '';
  const rates = Array.isArray(data.rates) ? data.rates : [];
  const maxPct = rates.length ? Math.max(...rates.map(r => r.pct)) : 1;

  const bars = rates.map((r, i) => {
    const color = USAGE_COLORS[i % USAGE_COLORS.length];
    const width = Math.max((r.pct / maxPct) * 100, 2);
    return `
      <div class="usage-bar-row">
        <span class="usage-bar-label">${_e(r.oshi)}</span>
        <div class="usage-bar-track">
          <div class="usage-bar-fill" style="width:${Number(width)}%;background:${color}">
            <span class="usage-bar-pct">${Number(r.pct) || 0}%</span>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <details class="usage-chart-wrapper" open>
      <summary class="usage-chart-title">${t('tournament_usage_rate')}<span class="usage-chart-scope">${_e(scope)}</span></summary>
      <div class="usage-chart-bars">${bars}</div>
      <div class="usage-chart-source">${t('tournament_source')}: ${_e(data.source || '')}</div>
    </details>`;
}

function renderTournamentDeckCard(deck, cardsMap) {
  if (deck.missing) {
    const placementHtml = deck.placement
      ? `<span class="tournament-placement">${_e(deck.placement)}</span>`
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
    ? `<span class="tournament-placement">${_e(deck.placement)}</span>`
    : '';

  return `
    <div class="tournament-deck-card" data-decklog-id="${_e(deck.deck_id)}">
      <div class="tournament-deck-top">
        ${oshiImage ? `<img class="tournament-oshi-img" src="${_e(oshiImage)}" alt="${_e(deck.oshi)}" loading="lazy">` : '<div class="tournament-oshi-placeholder"></div>'}
        <div class="tournament-deck-info">
          <div class="tournament-deck-name">${_e(deck.title)}</div>
          <div class="tournament-deck-oshi">${_e(deck.oshi)}</div>
          ${placementHtml}
        </div>
      </div>
      <div class="tournament-deck-stats">
        <span>${t('tournament_main_deck')}: ${Number(deck.main_deck_count) || 0} ${t('tournament_cards')}</span>
        <span>${t('tournament_cheer_deck')}: ${Number(deck.cheer_deck_count) || 0} ${t('tournament_cards')}</span>
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
      <div class="modal-deck-title">${_e(deck.title)}</div>
      <div class="modal-deck-meta">
        <span class="tournament-oshi-badge">${_e(deck.oshi)}</span>
        ${deck.event ? `<span class="tournament-event-badge">${_e(deck.event)}</span>` : ''}
        ${deck.placement ? `<span class="tournament-placement-badge">${_e(deck.placement)}</span>` : ''}
      </div>
    </div>
    ${oshiHtml}
    ${mainHtml}
    ${cheerHtml}
    ${deck.url ? `
      <div class="modal-section" style="padding-bottom:2rem">
        <a class="modal-source-link" href="${_e(deck.url)}" target="_blank" rel="noopener">
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
      <div class="dl-card-entry clickable-card" data-card-id="${_e(c.card_id || '')}">
        ${imageUrl ? `<img class="dl-card-img" src="${_e(imageUrl)}" alt="${_e(name)}" loading="lazy">` : '<div class="dl-card-placeholder"></div>'}
        <div class="dl-card-info">
          <div class="dl-card-name">${_e(name)}</div>
          <div class="dl-card-id">${_e(c.card_id)}</div>
          ${c.count > 1 ? `<div class="dl-card-count">x${Number(c.count) || 0}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="modal-section">
      <div class="modal-section-title">${_e(title)}</div>
      <div class="dl-card-grid">
        ${cardsHtml}
      </div>
    </div>
  `;
}
