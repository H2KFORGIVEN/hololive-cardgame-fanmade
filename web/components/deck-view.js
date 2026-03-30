import { t, localized } from '../i18n.js';

export function renderDeckModal(container, deckId, tierData, decksData, allGuides, officialDecks) {
  let deckInfo = null;
  let tierNum = null;
  if (tierData?.tiers) {
    for (const tier of tierData.tiers) {
      for (const d of tier.decks) {
        if (d.id === deckId) {
          deckInfo = d;
          tierNum = tier.tier;
          break;
        }
      }
      if (deckInfo) break;
    }
  }

  let recipe = decksData?.find(d => d.deck_id === deckId);

  if (!recipe && allGuides) {
    recipe = allGuides.find(d => d.deck_id === deckId);
  }

  const officialDeck = officialDecks?.find(d => d.deck_id === deckId);

  if (!deckInfo && !recipe && !officialDeck) {
    container.innerHTML = `<p>${t('deck_not_found')}</p>`;
    return;
  }

  if (officialDeck) {
    _renderOfficialDeckModal(container, officialDeck);
    return;
  }

  const title = deckInfo?.name || localized(recipe?.title) || deckId;
  const image = recipe?.deck_image || deckInfo?.image;
  const imageHtml = image
    ? `<img src="${image}" alt="${title}" loading="lazy">`
    : '';

  const cardsHtml = recipe?.cards?.length
    ? recipe.cards.map(c => `
        <div class="card-entry">
          ${c.image ? `<img class="card-entry-img" src="${c.image}" alt="${c.name}" loading="lazy">` : ''}
          <div class="card-entry-info">
            <div class="card-entry-name">${c.name}</div>
            ${c.card_id ? `<div class="card-entry-id">${c.card_id}</div>` : ''}
            <div class="card-entry-role">${localized(c.role)}</div>
          </div>
        </div>
      `).join('')
    : `<p style="color:var(--text-secondary);font-size:0.85rem">${t('no_card_list')}</p>`;

  const strategyHtml = recipe?.strategy?.length
    ? recipe.strategy.map(s => `
        <div class="strategy-block">
          <div class="strategy-title">${localized(s.title)}</div>
          <div class="strategy-text">${localized(s.text)}</div>
        </div>
      `).join('')
    : '';

  const features = deckInfo ? localized(deckInfo.features, []) : [];
  const featuresList = Array.isArray(features) ? features : [];
  const featuresHtml = featuresList.map(f => `<li>${f}</li>`).join('');

  const tierBadge = tierNum
    ? `<span class="tier-badge" data-tier="${tierNum}" style="font-size:0.8rem;padding:2px 8px">TIER ${tierNum}</span>&nbsp;`
    : '';
  const vtuber = deckInfo?.vtuber || '';

  container.innerHTML = `
    <div class="modal-deck-header">
      ${imageHtml}
      <div class="modal-deck-title">${title}</div>
      <div class="modal-deck-meta">
        ${tierBadge}${vtuber}
      </div>
      ${recipe?.description ? `<div class="modal-deck-desc">${localized(recipe.description)}</div>` : ''}
      ${featuresHtml ? `
        <ul class="deck-features" style="margin-bottom:1rem">${featuresHtml}</ul>
      ` : ''}
    </div>

    ${cardsHtml ? `
      <div class="modal-section">
        <div class="modal-section-title">${t('section_cards')}</div>
        ${cardsHtml}
      </div>
    ` : ''}

    ${strategyHtml ? `
      <div class="modal-section">
        <div class="modal-section-title">${t('section_strategy')}</div>
        ${strategyHtml}
      </div>
    ` : ''}

    ${recipe?.url ? `
      <div class="modal-section" style="padding-bottom:2rem">
        <a class="modal-source-link" href="${recipe.url}" target="_blank" rel="noopener">
          ${t('source_link')}
        </a>
      </div>
    ` : ''}
  `;
}

function _renderOfficialDeckModal(container, deck) {
  const title = deck.title || '';
  const oshiHtml = deck.oshi_image
    ? `<div class="official-oshi"><img src="${deck.oshi_image}" alt="${deck.oshi}" loading="lazy"><span>${deck.oshi}</span></div>`
    : '';

  const _renderCardGrid = (cards, label) => {
    if (!cards?.length) return '';
    const count = cards.reduce((s, c) => s + c.count, 0);
    return `
      <div class="modal-section">
        <div class="modal-section-title">${label}【${count}】</div>
        <div class="official-card-grid">
          ${cards.map(c => `
            <div class="official-card-entry">
              <img src="${c.imageUrl}" alt="${c.card_id}" loading="lazy">
              <span class="official-card-count">×${c.count}</span>
              ${c.card_id ? `<span class="official-card-id">${c.card_id}</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  const strategyHtml = deck.strategy?.length
    ? `<div class="modal-section">
        <div class="modal-section-title">${t('section_strategy')}</div>
        ${deck.strategy.map(s => `<div class="strategy-block"><div class="strategy-text">${s.text}</div></div>`).join('')}
      </div>`
    : '';

  const keyCardsHtml = deck.key_cards?.length
    ? `<div class="modal-section">
        <div class="modal-section-title">${t('official_key_cards')}</div>
        ${deck.key_cards.map(k => `
          <div class="official-key-card">
            ${k.imageUrl ? `<img src="${k.imageUrl}" alt="${k.name}" loading="lazy">` : ''}
            <div class="official-key-card-info">
              <div class="official-key-card-name">${k.name}${k.card_id ? ` (${k.card_id})` : ''}</div>
              <div class="official-key-card-text">${k.text}</div>
            </div>
          </div>
        `).join('')}
      </div>`
    : '';

  container.innerHTML = `
    <div class="modal-deck-header">
      <div class="modal-deck-title">${title}</div>
      <div class="modal-deck-meta">
        <span class="guide-source-badge official-src">Official</span>
        ${deck.date ? `<span style="color:var(--accent-cyan);margin-left:0.5rem">${deck.date}</span>` : ''}
      </div>
      ${deck.description ? `<div class="modal-deck-desc">${deck.description}</div>` : ''}
      ${oshiHtml}
    </div>
    ${_renderCardGrid(deck.main_deck, 'Main Deck')}
    ${_renderCardGrid(deck.cheer_deck, 'Cheer Deck')}
    ${strategyHtml}
    ${keyCardsHtml}
    ${deck.url ? `
      <div class="modal-section" style="padding-bottom:2rem">
        <a class="modal-source-link" href="${deck.url}" target="_blank" rel="noopener">
          ${t('source_link')}
        </a>
      </div>
    ` : ''}
  `;
}
