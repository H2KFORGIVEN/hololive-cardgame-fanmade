import { t, localized } from '../i18n.js';

export function renderDeckModal(container, deckId, tierData, decksData, allGuides) {
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

  if (!deckInfo && !recipe) {
    container.innerHTML = `<p>${t('deck_not_found')}</p>`;
    return;
  }

  const title = deckInfo?.name || recipe?.title || deckId;
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
