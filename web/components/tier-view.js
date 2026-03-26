const RATING_LABELS = {
  firepower: '火力',
  ease: '易用',
  stability: '安定',
  endurance: '持久',
  pressure: '壓制',
};

const TIER_CRITERIA = {
  1: '環境トップ・最高入賞率',
  2: '高い押し付け性能',
  3: '環境で十分に戦える',
};

export function renderTierView(container, tierData, decksData) {
  if (!tierData || !tierData.tiers) {
    container.innerHTML = '<div class="loading">Tier data not available</div>';
    return;
  }

  const decksMap = {};
  if (decksData) {
    for (const d of decksData) {
      decksMap[d.deck_id] = d;
    }
  }

  let html = `<div class="tier-updated">Updated: ${tierData.updated || 'N/A'}</div>`;

  for (const tier of tierData.tiers) {
    html += `
      <section class="tier-section">
        <div class="tier-header">
          <span class="tier-badge" data-tier="${tier.tier}">TIER ${tier.tier}</span>
          <span class="tier-label">${tier.decks.length} decks</span>
          <span class="tier-criteria">${TIER_CRITERIA[tier.tier] || ''}</span>
        </div>
        <div class="deck-grid">
          ${tier.decks.map(deck => renderDeckCard(deck, tier.tier, decksMap)).join('')}
        </div>
      </section>
    `;
  }

  container.innerHTML = html;
}

function renderDeckCard(deck, tierNum, decksMap) {
  const hasRecipe = !!decksMap[deck.id];
  const imageHtml = deck.image
    ? `<img class="deck-card-image" src="${deck.image}" alt="${deck.name}" loading="lazy">`
    : `<div class="deck-no-image">🃏</div>`;

  const ratingsHtml = Object.entries(deck.ratings || {}).map(([key, val]) => `
    <span class="rating-chip">
      <span class="rating-label">${RATING_LABELS[key] || key}</span>
      <span class="rating-value" data-val="${val}">${val}</span>
    </span>
  `).join('');

  const featuresHtml = (deck.features || []).map(f => `<li>${f}</li>`).join('');

  return `
    <div class="deck-card" data-deck-id="${deck.id}" data-tier="${tierNum}">
      ${imageHtml}
      ${hasRecipe ? '<span class="deck-recipe-badge">RECIPE</span>' : ''}
      <div class="deck-card-body">
        <div class="deck-card-top">
          <span class="deck-vtuber">${deck.vtuber}</span>
        </div>
        <div class="deck-name">${deck.name}</div>
        ${ratingsHtml ? `<div class="deck-ratings">${ratingsHtml}</div>` : ''}
        ${featuresHtml ? `<ul class="deck-features">${featuresHtml}</ul>` : ''}
      </div>
    </div>
  `;
}
