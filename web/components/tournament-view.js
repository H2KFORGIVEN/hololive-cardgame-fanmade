import { t } from '../i18n.js';

export function renderTournamentView(container, decklogDecks, cardsData) {
  if (!decklogDecks || !decklogDecks.length) {
    container.innerHTML = `<div class="loading">${t('tournament_no_decks')}</div>`;
    return;
  }

  const cardsMap = {};
  if (cardsData) {
    for (const c of cardsData) cardsMap[c.id] = c;
  }

  const grouped = {};
  for (const deck of decklogDecks) {
    const key = deck.event || deck.source || 'Other';
    if (!grouped[key]) grouped[key] = { decks: [], date: deck.event_date || '' };
    grouped[key].decks.push(deck);
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

  for (const [event, { decks, date }] of sortedEvents) {
    html += `
      <section class="tournament-event-section">
        <div class="tournament-event-header">
          <span class="tournament-event-name">${event}</span>
          ${date ? `<span class="tournament-event-date">${date}</span>` : ''}
          <span class="tournament-event-count">${decks.length} ${t('decks_count')}</span>
        </div>
        <div class="tournament-deck-grid">
          ${decks.map(deck => renderTournamentDeckCard(deck, cardsMap)).join('')}
        </div>
      </section>
    `;
  }

  container.innerHTML = html;
}

function renderTournamentDeckCard(deck, cardsMap) {
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
      <div class="dl-card-entry">
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
