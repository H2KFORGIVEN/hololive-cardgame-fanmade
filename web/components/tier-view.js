import { t, localized } from '../i18n.js';
import { escape as _e } from './_escape.js';

const RATING_KEYS = ['firepower', 'ease', 'stability', 'endurance', 'pressure'];

export function renderTierView(container, tierData, decksData) {
  if (!tierData || !tierData.tiers) {
    container.innerHTML = `<div class="loading">${t('tier_not_available')}</div>`;
    return;
  }

  const decksMap = {};
  if (decksData) {
    for (const d of decksData) {
      decksMap[d.deck_id] = d;
    }
  }

  let html = `<div class="tier-updated">${t('updated')}: ${_e(tierData.updated || 'N/A')}</div>`;

  for (const tier of tierData.tiers) {
    const visibleDecks = tier.decks.filter(d => !!decksMap[d.id]);
    if (!visibleDecks.length) continue;
    const criteriaKey = `tier_criteria_${tier.tier}`;
    html += `
      <section class="tier-section">
        <div class="tier-header">
          <span class="tier-badge" data-tier="${_e(tier.tier)}">TIER ${_e(tier.tier)}</span>
          <span class="tier-label">${visibleDecks.length} ${t('decks_count')}</span>
          <span class="tier-criteria">${t(criteriaKey)}</span>
        </div>
        <div class="deck-grid">
          ${visibleDecks.map(deck => renderDeckCard(deck, tier.tier, decksMap)).join('')}
        </div>
      </section>
    `;
  }

  container.innerHTML = html;
}

function renderDeckCard(deck, tierNum, decksMap) {
  const hasRecipe = !!decksMap[deck.id];
  const imageHtml = deck.image
    ? `<img class="deck-card-image" src="${_e(deck.image)}" alt="${_e(deck.name)}" loading="lazy">`
    : `<div class="deck-no-image">🃏</div>`;

  const ratingsHtml = Object.entries(deck.ratings || {}).map(([key, val]) => `
    <span class="rating-chip">
      <span class="rating-label">${t('rating_' + key)}</span>
      <span class="rating-value" data-val="${_e(val)}">${_e(val)}</span>
    </span>
  `).join('');

  const features = localized(deck.features, []);
  const featuresList = Array.isArray(features) ? features : [];
  const featuresHtml = featuresList.map(f => `<li>${_e(f)}</li>`).join('');

  return `
    <div class="deck-card" data-deck-id="${_e(deck.id)}" data-tier="${_e(tierNum)}">
      ${imageHtml}
      ${hasRecipe ? '<span class="deck-recipe-badge">RECIPE</span>' : ''}
      <div class="deck-card-body">
        <div class="deck-card-top">
          <span class="deck-vtuber">${_e(deck.vtuber)}</span>
        </div>
        <div class="deck-name">${_e(deck.name)}</div>
        ${ratingsHtml ? `<div class="deck-ratings">${ratingsHtml}</div>` : ''}
        ${featuresHtml ? `<ul class="deck-features">${featuresHtml}</ul>` : ''}
      </div>
    </div>
  `;
}
