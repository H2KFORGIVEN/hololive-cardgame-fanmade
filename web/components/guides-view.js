import { t, localized } from '../i18n.js';

const COLOR_ZH_MAP = { '白': '白', '綠': '緑', '紅': '赤', '藍': '青', '紫': '紫', '黃': '黄' };

function _getDeckColors(deck, cardsMap) {
  const colors = {};
  for (const c of deck.cards || []) {
    const id = c.card_id;
    if (!id) continue;
    const dbCard = cardsMap[id];
    if (dbCard?.color) {
      colors[dbCard.color] = (colors[dbCard.color] || 0) + 1;
    }
  }
  return Object.keys(colors).sort((a, b) => colors[b] - colors[a]);
}

export function renderGuidesView(container, allGuides, decksData, cardsData, filters) {
  const cardsMap = {};
  if (cardsData) {
    for (const c of cardsData) cardsMap[c.id] = c;
  }

  const combined = [];
  if (decksData) {
    for (const d of decksData) {
      combined.push({ ...d, _source: 'tier' });
    }
  }
  if (allGuides) {
    const tierUrls = new Set(decksData ? decksData.map(d => d.url) : []);
    for (const g of allGuides) {
      if (!tierUrls.has(g.url)) {
        combined.push({ ...g, _source: 'guide' });
      }
    }
  }

  const colorFilter = filters?.color || 'all';
  const tierFilter = filters?.tier || 'all';
  let filtered = combined;
  if (colorFilter !== 'all') {
    const targetJa = COLOR_ZH_MAP[colorFilter] || colorFilter;
    filtered = filtered.filter(d => {
      const deckColors = _getDeckColors(d, cardsMap);
      return deckColors.includes(targetJa) || deckColors.includes(colorFilter);
    });
  }
  if (tierFilter !== 'all') {
    if (tierFilter === 'guide') {
      filtered = filtered.filter(d => !d.tier);
    } else {
      filtered = filtered.filter(d => String(d.tier) === tierFilter);
    }
  }

  if (!combined.length) {
    container.innerHTML = `<div class="loading">${t('guides_no_data')}</div>`;
    return;
  }

  const tierBtns = [
    { val: 'all', label: 'ALL' },
    { val: '1', label: 'Tier 1' },
    { val: '2', label: 'Tier 2' },
    { val: '3', label: 'Tier 3' },
    { val: 'guide', label: t('guides_filter_guide') },
  ];

  let html = `
    <div class="guides-header">
      <h2>${t('guides_title')}</h2>
      <p class="guides-desc">${t('guides_desc')}</p>
      <div class="guides-filter-row">
        <div class="guides-tier-filters">
          ${tierBtns.map(b => `<button class="tier-filter-btn${tierFilter === b.val ? ' active' : ''}" data-tier-filter="${b.val}">${b.label}</button>`).join('')}
        </div>
        <div class="guides-search-box">
          <input type="text" id="guideSearch" class="search-input" placeholder="${t('guides_search_placeholder')}" />
        </div>
      </div>
    </div>
    <div class="guides-count">${filtered.length} ${t('guides_count_label')}</div>
    <div class="guides-grid" id="guidesGrid">
      ${filtered.map(d => renderGuideCard(d, cardsMap)).join('')}
    </div>
  `;

  container.innerHTML = html;

  container.querySelectorAll('.tier-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      filters.tier = btn.dataset.tierFilter;
      renderGuidesView(container, allGuides, decksData, cardsData, filters);
    });
  });

  const searchInput = container.querySelector('#guideSearch');
  let debounce;
  searchInput?.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const q = searchInput.value.trim().toLowerCase();
      const cards = container.querySelectorAll('.guide-card');
      let visible = 0;
      cards.forEach(card => {
        const text = card.dataset.searchText || '';
        const show = !q || text.includes(q);
        card.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      container.querySelector('.guides-count').textContent = `${visible} ${t('guides_count_label')}`;
    }, 200);
  });
}

const COLOR_CSS = { '白': '#e8e8e8', '緑': '#4caf50', '赤': '#f44336', '青': '#2196f3', '紫': '#9c27b0', '黄': '#ffeb3b' };

function renderGuideCard(deck, cardsMap) {
  const title = localized(deck.title, deck.deck_id || '');
  const imgHtml = deck.deck_image
    ? `<img class="guide-card-img" src="${deck.deck_image}" alt="${title}" loading="lazy">`
    : `<div class="guide-card-noimg">🃏</div>`;

  const tierBadge = deck.tier
    ? `<span class="guide-tier-badge" data-tier="${deck.tier}">T${deck.tier}</span>`
    : '';

  const sourceBadge = deck._source === 'tier'
    ? `<span class="guide-source-badge tier-src">Tier</span>`
    : `<span class="guide-source-badge guide-src">Guide</span>`;

  const deckColors = _getDeckColors(deck, cardsMap);
  const colorDots = deckColors.slice(0, 3).map(c =>
    `<span class="guide-color-dot" style="background:${COLOR_CSS[c] || '#888'}"></span>`
  ).join('');

  const desc = localized(deck.description, '');
  const descText = typeof desc === 'string' ? desc : '';
  const cardCount = (deck.cards || []).length;
  const stratCount = (deck.strategy || []).length;

  const jaTitle = typeof deck.title === 'object' ? (deck.title.ja || '') : (deck.title || '');
  const searchText = [jaTitle, title, descText, deck.deck_id].join(' ').toLowerCase();

  return `
    <div class="guide-card deck-card" data-deck-id="${deck.deck_id}" data-search-text="${searchText.replace(/"/g, '')}">
      ${imgHtml}
      <div class="guide-card-body">
        <div class="guide-card-top">
          ${sourceBadge}${tierBadge}
          ${colorDots ? `<span class="guide-color-dots">${colorDots}</span>` : ''}
        </div>
        <div class="guide-card-title">${title}</div>
        ${descText ? `<p class="guide-card-desc">${descText.slice(0, 100)}${descText.length > 100 ? '...' : ''}</p>` : ''}
        <div class="guide-card-meta">
          ${cardCount ? `<span>${cardCount} ${t('guides_cards')}</span>` : ''}
          ${stratCount ? `<span>${stratCount} ${t('guides_strats')}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}
