export function renderDeckModal(container, deckId, tierData, decksData) {
  let deckInfo = null;
  let tierNum = null;
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

  if (!deckInfo) {
    container.innerHTML = '<p>Deck not found</p>';
    return;
  }

  const recipe = decksData?.find(d => d.deck_id === deckId);

  const imageHtml = (recipe?.deck_image || deckInfo.image)
    ? `<img src="${recipe?.deck_image || deckInfo.image}" alt="${deckInfo.name}" loading="lazy">`
    : '';

  const cardsHtml = recipe?.cards?.length
    ? recipe.cards.map(c => `
        <div class="card-entry">
          ${c.image ? `<img class="card-entry-img" src="${c.image}" alt="${c.name}" loading="lazy">` : ''}
          <div class="card-entry-info">
            <div class="card-entry-name">${c.name}</div>
            ${c.card_id ? `<div class="card-entry-id">${c.card_id}</div>` : ''}
            <div class="card-entry-role">${c.role}</div>
          </div>
        </div>
      `).join('')
    : '<p style="color:var(--text-secondary);font-size:0.85rem">No detailed card list available for this deck.</p>';

  const strategyHtml = recipe?.strategy?.length
    ? recipe.strategy.map(s => `
        <div class="strategy-block">
          <div class="strategy-title">${s.title}</div>
          <div class="strategy-text">${s.text}</div>
        </div>
      `).join('')
    : '';

  const featuresHtml = (deckInfo.features || [])
    .map(f => `<li>${f}</li>`).join('');

  container.innerHTML = `
    <div class="modal-deck-header">
      ${imageHtml}
      <div class="modal-deck-title">${deckInfo.name}</div>
      <div class="modal-deck-meta">
        <span class="tier-badge" data-tier="${tierNum}" style="font-size:0.8rem;padding:2px 8px">TIER ${tierNum}</span>
        &nbsp; ${deckInfo.vtuber}
      </div>
      ${recipe?.description ? `<div class="modal-deck-desc">${recipe.description}</div>` : ''}
      ${featuresHtml ? `
        <ul class="deck-features" style="margin-bottom:1rem">${featuresHtml}</ul>
      ` : ''}
    </div>

    ${cardsHtml ? `
      <div class="modal-section">
        <div class="modal-section-title">採用カード解説</div>
        ${cardsHtml}
      </div>
    ` : ''}

    ${strategyHtml ? `
      <div class="modal-section">
        <div class="modal-section-title">回し方 (Strategy)</div>
        ${strategyHtml}
      </div>
    ` : ''}

    ${recipe?.url ? `
      <div class="modal-section" style="padding-bottom:2rem">
        <a class="modal-source-link" href="${recipe.url}" target="_blank" rel="noopener">
          原文攻略を見る →
        </a>
      </div>
    ` : ''}
  `;
}
