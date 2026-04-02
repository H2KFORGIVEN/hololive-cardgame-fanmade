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

export function renderGuidesView(container, allGuides, decksData, cardsData, filters, officialDecks) {
  const cardsMap = {};
  if (cardsData) {
    for (const c of cardsData) cardsMap[c.id] = c;
  }

  const combined = [];
  if (officialDecks) {
    for (const d of officialDecks) {
      combined.push({ ...d, _source: 'official', cards: d.main_deck || [] });
    }
  }
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
    if (tierFilter === 'official') {
      filtered = filtered.filter(d => d._source === 'official');
    } else if (tierFilter === 'guide') {
      filtered = filtered.filter(d => !d.tier && d._source !== 'official');
    } else {
      filtered = filtered.filter(d => String(d.tier) === tierFilter);
    }
  }

  filtered.sort((a, b) => {
    const da = a.date || '';
    const db = b.date || '';
    if (db > da) return 1;
    if (da > db) return -1;
    return (a.tier || 99) - (b.tier || 99);
  });

  if (!combined.length) {
    container.innerHTML = `<div class="loading">${t('guides_no_data')}</div>`;
    return;
  }

  const PAGE_SIZE = 50;
  let shown = PAGE_SIZE;
  const initial = filtered.slice(0, shown);
  const remaining = filtered.length - shown;

  let html = `
    <div class="guides-header">
      <h2>${t('guides_title')}</h2>
      <p class="guides-desc">${t('guides_desc')}</p>
      <div class="guides-search-box">
        <input type="text" id="guideSearch" class="search-input" placeholder="${t('guides_search_placeholder')}" />
      </div>
    </div>
    <div class="guides-count" id="guidesCount">${t('guides_showing', { shown: Math.min(shown, filtered.length), total: filtered.length })}</div>
    <div class="guides-grid" id="guidesGrid">
      ${initial.map(d => renderGuideCard(d, cardsMap)).join('')}
    </div>
    ${remaining > 0 ? `<div class="guides-load-more-wrap"><button class="guides-load-more-btn" id="guidesLoadMore">${t('guides_load_more', { remaining })}</button></div>` : ''}
  `;

  container.innerHTML = html;

  const grid = container.querySelector('#guidesGrid');
  const countEl = container.querySelector('#guidesCount');
  const loadMoreBtn = container.querySelector('#guidesLoadMore');

  function _loadMore() {
    const next = filtered.slice(shown, shown + PAGE_SIZE);
    grid.insertAdjacentHTML('beforeend', next.map(d => renderGuideCard(d, cardsMap)).join(''));
    shown += next.length;
    const left = filtered.length - shown;
    countEl.textContent = t('guides_showing', { shown: Math.min(shown, filtered.length), total: filtered.length });
    if (left <= 0) {
      loadMoreBtn?.remove();
    } else {
      loadMoreBtn.textContent = t('guides_load_more', { remaining: left });
    }
  }

  loadMoreBtn?.addEventListener('click', _loadMore);

  const searchInput = container.querySelector('#guideSearch');
  let debounce;
  searchInput?.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) {
        grid.innerHTML = filtered.slice(0, shown).map(d => renderGuideCard(d, cardsMap)).join('');
        countEl.textContent = t('guides_showing', { shown: Math.min(shown, filtered.length), total: filtered.length });
        const wrap = container.querySelector('.guides-load-more-wrap');
        if (!wrap && shown < filtered.length) {
          grid.insertAdjacentHTML('afterend', `<div class="guides-load-more-wrap"><button class="guides-load-more-btn" id="guidesLoadMore">${t('guides_load_more', { remaining: filtered.length - shown })}</button></div>`);
          container.querySelector('#guidesLoadMore')?.addEventListener('click', _loadMore);
        }
        return;
      }
      const matched = filtered.filter(d => {
        const title = localized(d.title, '');
        const jaTitle = typeof d.title === 'object' ? (d.title.ja || '') : (d.title || '');
        const desc = localized(d.description, '');
        const text = [jaTitle, title, typeof desc === 'string' ? desc : '', d.deck_id].join(' ').toLowerCase();
        return text.includes(q);
      });
      grid.innerHTML = matched.map(d => renderGuideCard(d, cardsMap)).join('');
      countEl.textContent = `${matched.length} ${t('guides_count_label')}`;
      const wrap = container.querySelector('.guides-load-more-wrap');
      if (wrap) wrap.style.display = 'none';
    }, 200);
  });
}

const COLOR_CSS = { '白': '#e8e8e8', '緑': '#4caf50', '赤': '#f44336', '青': '#2196f3', '紫': '#9c27b0', '黄': '#ffeb3b' };

function renderGuideCard(deck, cardsMap) {
  const title = localized(deck.title, deck.deck_id || '');
  const thumbSrc = deck.deck_image || deck.oshi_image;
  const isCardArt = !deck.deck_image && !!deck.oshi_image;
  const imgCls = isCardArt ? 'guide-card-img card-art' : 'guide-card-img';
  const imgHtml = thumbSrc
    ? `<img class="${imgCls}" src="${thumbSrc}" alt="${title}" loading="lazy">`
    : `<div class="guide-card-noimg">🃏</div>`;

  const tierBadge = deck.tier
    ? `<span class="guide-tier-badge" data-tier="${deck.tier}">T${deck.tier}</span>`
    : '';

  const sourceBadge = deck._source === 'official'
    ? `<span class="guide-source-badge official-src">Official</span>`
    : deck._source === 'tier'
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
          ${deck.date ? `<span class="guide-card-date">${deck.date}</span>` : ''}
          ${cardCount ? `<span>${cardCount} ${t('guides_cards')}</span>` : ''}
          ${stratCount ? `<span>${stratCount} ${t('guides_strats')}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}
