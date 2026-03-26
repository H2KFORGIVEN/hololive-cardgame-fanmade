const COLOR_MAP = {
  '白': '#e0e0e0',
  '綠': '#4caf50',
  '紅': '#f44336',
  '藍': '#2196f3',
  '紫': '#9c27b0',
  '黃': '#ffeb3b',
};

const PAGE_SIZE = 60;
let currentPage = 0;
let filteredCards = [];

export function renderCardGallery(container, cards, filters) {
  filteredCards = applyFilters(cards, filters);
  currentPage = 0;
  renderPage(container);
}

function applyFilters(cards, filters) {
  return cards.filter(card => {
    if (filters.color && filters.color !== 'all') {
      if (card.color !== filters.color) return false;
    }
    if (filters.type && filters.type !== 'all') {
      if (filters.type === 'support') {
        if (!card.type?.startsWith('支援')) return false;
      } else {
        if (card.type !== filters.type) return false;
      }
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const searchable = [
        card.name, card.id, card.tag, card.type,
        card.oshiSkill?.name, card.oshiSkill?.effect,
        card.spSkill?.name, card.spSkill?.effect,
        card.effectC?.name, card.effectC?.effect,
        card.art1?.name, card.art1?.effect,
        card.supportEffect,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });
}

function renderPage(container) {
  const start = 0;
  const end = (currentPage + 1) * PAGE_SIZE;
  const visible = filteredCards.slice(start, end);
  const hasMore = end < filteredCards.length;

  let html = `<div class="card-count-info">顯示 ${visible.length} / ${filteredCards.length} 張卡片</div>`;
  html += '<div class="card-gallery">';
  for (const card of visible) {
    const color = COLOR_MAP[card.color] || '#666';
    html += `
      <div class="gallery-card" data-card-id="${card.id}">
        <img class="gallery-card-img" src="${card.imageUrl || ''}" alt="${card.name}" loading="lazy"
             onerror="this.style.display='none'">
        <div class="gallery-card-info">
          <div class="gallery-card-name" title="${card.name}">${card.name}</div>
          <div class="gallery-card-meta">
            <span class="gallery-card-color" style="background:${color}"></span>
            <span>${card.type || ''}</span>
            ${card.bloom ? `<span>· ${card.bloom}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }
  html += '</div>';

  if (hasMore) {
    html += `<div style="text-align:center;padding:1.5rem">
      <button class="nav-btn" id="loadMoreCards">載入更多 (${filteredCards.length - end} remaining)</button>
    </div>`;
  }

  container.innerHTML = html;

  if (hasMore) {
    document.getElementById('loadMoreCards')?.addEventListener('click', () => {
      currentPage++;
      renderPage(container);
    });
  }
}

export function renderCardDetail(container, card) {
  if (!card) {
    container.innerHTML = '<p>Card not found</p>';
    return;
  }

  const isOshi = card.type === '主推';
  const isMember = card.type === '成員';
  const isSupport = card.type?.startsWith('支援');
  const isCheer = card.type === '吶喊';

  let statsHtml = '';
  if (isOshi) {
    statsHtml = `
      <div class="stat-label">Life</div><div class="stat-value">${card.life || '?'}</div>
      <div class="stat-label">Color</div><div class="stat-value">${card.color || '?'}</div>
    `;
  } else if (isMember) {
    statsHtml = `
      <div class="stat-label">HP</div><div class="stat-value">${card.hp || '?'}</div>
      <div class="stat-label">Bloom</div><div class="stat-value">${card.bloom || '?'}</div>
      <div class="stat-label">Color</div><div class="stat-value">${card.color || '?'}</div>
    `;
  } else if (isSupport || isCheer) {
    statsHtml = `
      <div class="stat-label">Type</div><div class="stat-value">${card.type}</div>
      ${card.color ? `<div class="stat-label">Color</div><div class="stat-value">${card.color}</div>` : ''}
    `;
  }

  let effectsHtml = '';

  if (isOshi) {
    if (card.oshiSkill) {
      effectsHtml += renderEffect('推しスキル: ' + card.oshiSkill.name, card.oshiSkill.effect, `HP: ${card.oshiSkill.holoPower}`);
    }
    if (card.spSkill) {
      effectsHtml += renderEffect('SP: ' + card.spSkill.name, card.spSkill.effect, `HP: ${card.spSkill.holoPower}`);
    }
  } else if (isMember) {
    for (const [key, label] of [['effectC', 'コラボ'], ['effectB', 'ブルーム'], ['effectG', 'ギフト']]) {
      const eff = card[key];
      if (eff) effectsHtml += renderEffect(`${label}: ${eff.name}`, eff.effect);
    }
    if (card.art1) {
      effectsHtml += renderEffect(
        `アーツ: ${card.art1.name}`,
        [card.art1.damage ? `Damage: ${card.art1.damage}` : '', card.art1.effect || ''].filter(Boolean).join('\n')
      );
    }
    if (card.art2) {
      effectsHtml += renderEffect(
        `アーツ2: ${card.art2.name}`,
        [card.art2.damage ? `Damage: ${card.art2.damage}` : '', card.art2.effect || ''].filter(Boolean).join('\n')
      );
    }
    if (card.extra) {
      effectsHtml += renderEffect('特殊', card.extra);
    }
  } else if (isSupport) {
    if (card.supportEffect) {
      effectsHtml += renderEffect('支援效果', card.supportEffect);
    }
  } else if (isCheer) {
    if (card.yellEffect) {
      effectsHtml += renderEffect('吶喊效果', card.yellEffect);
    }
  }

  const tagsHtml = card.tag
    ? card.tag.split('/').map(t => `<span class="tag-chip">${t.trim()}</span>`).join('')
    : '';

  const productText = Array.isArray(card.product) ? card.product.join(', ') : (card.product || '');

  container.innerHTML = `
    <div class="card-detail">
      <img class="card-detail-img" src="${card.imageUrl || ''}" alt="${card.name}">
      <div class="card-detail-info">
        <div class="card-detail-name">${card.name}</div>
        <div class="card-detail-id">${card.id}</div>
        ${tagsHtml ? `<div class="card-detail-tags">${tagsHtml}</div>` : ''}
        <div class="card-detail-stats">${statsHtml}</div>
        ${productText ? `<div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.8rem">收錄: ${productText}</div>` : ''}
        <div class="card-detail-effects">${effectsHtml}</div>
      </div>
    </div>
  `;
}

function renderEffect(title, text, subtitle) {
  if (!text) return '';
  return `
    <div class="effect-block">
      <div class="effect-name">${title}${subtitle ? ` <span style="color:var(--text-secondary);font-size:0.75rem">(${subtitle})</span>` : ''}</div>
      <div class="effect-text">${text}</div>
    </div>
  `;
}
