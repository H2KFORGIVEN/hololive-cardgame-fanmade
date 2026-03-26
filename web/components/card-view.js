import { t, localized } from '../i18n.js';

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

function _effectText(obj) {
  if (!obj) return '';
  const eff = obj.effect;
  return typeof eff === 'object' ? localized(eff) : (eff || '');
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
        card.oshiSkill?.name, _effectText(card.oshiSkill),
        card.spSkill?.name, _effectText(card.spSkill),
        card.effectC?.name, _effectText(card.effectC),
        card.art1?.name, _effectText(card.art1),
        localized(card.supportEffect),
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

  let html = `<div class="card-count-info">${t('showing_cards', { shown: visible.length, total: filteredCards.length })}</div>`;
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
    const remaining = filteredCards.length - end;
    html += `<div style="text-align:center;padding:1.5rem">
      <button class="nav-btn" id="loadMoreCards">${t('load_more', { remaining })}</button>
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
    container.innerHTML = `<p>${t('card_not_found')}</p>`;
    return;
  }

  const isOshi = card.type === '主推';
  const isMember = card.type === '成員';
  const isSupport = card.type?.startsWith('支援');
  const isCheer = card.type === '吶喊';

  let statsHtml = '';
  if (isOshi) {
    statsHtml = `
      <div class="stat-label">${t('stat_life')}</div><div class="stat-value">${card.life || '?'}</div>
      <div class="stat-label">${t('stat_color')}</div><div class="stat-value">${card.color || '?'}</div>
    `;
  } else if (isMember) {
    statsHtml = `
      <div class="stat-label">${t('stat_hp')}</div><div class="stat-value">${card.hp || '?'}</div>
      <div class="stat-label">${t('stat_bloom')}</div><div class="stat-value">${card.bloom || '?'}</div>
      <div class="stat-label">${t('stat_color')}</div><div class="stat-value">${card.color || '?'}</div>
    `;
  } else if (isSupport || isCheer) {
    statsHtml = `
      <div class="stat-label">${t('stat_type')}</div><div class="stat-value">${card.type}</div>
      ${card.color ? `<div class="stat-label">${t('stat_color')}</div><div class="stat-value">${card.color}</div>` : ''}
    `;
  }

  let effectsHtml = '';

  if (isOshi) {
    if (card.oshiSkill) {
      effectsHtml += renderEffect(t('effect_oshi_skill') + ': ' + card.oshiSkill.name, _effectText(card.oshiSkill), `HP: ${card.oshiSkill.holoPower}`);
    }
    if (card.spSkill) {
      effectsHtml += renderEffect(t('effect_sp') + ': ' + card.spSkill.name, _effectText(card.spSkill), `HP: ${card.spSkill.holoPower}`);
    }
  } else if (isMember) {
    const effectKeys = [['effectC', 'effect_collab'], ['effectB', 'effect_bloom'], ['effectG', 'effect_gift']];
    for (const [key, i18nKey] of effectKeys) {
      const eff = card[key];
      if (eff) effectsHtml += renderEffect(`${t(i18nKey)}: ${eff.name}`, _effectText(eff));
    }
    if (card.art1) {
      const artEffect = _effectText(card.art1);
      effectsHtml += renderEffect(
        `${t('effect_arts')}: ${card.art1.name}`,
        [card.art1.damage ? `${t('stat_damage')}: ${card.art1.damage}` : '', artEffect].filter(Boolean).join('\n')
      );
    }
    if (card.art2) {
      const artEffect = _effectText(card.art2);
      effectsHtml += renderEffect(
        `${t('effect_arts2')}: ${card.art2.name}`,
        [card.art2.damage ? `${t('stat_damage')}: ${card.art2.damage}` : '', artEffect].filter(Boolean).join('\n')
      );
    }
    if (card.extra) {
      effectsHtml += renderEffect(t('effect_extra'), localized(card.extra));
    }
  } else if (isSupport) {
    if (card.supportEffect) {
      effectsHtml += renderEffect(t('effect_support'), localized(card.supportEffect));
    }
  } else if (isCheer) {
    if (card.yellEffect) {
      effectsHtml += renderEffect(t('effect_cheer'), localized(card.yellEffect));
    }
  }

  const tagsHtml = card.tag
    ? card.tag.split('/').map(tg => `<span class="tag-chip">${tg.trim()}</span>`).join('')
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
        ${productText ? `<div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.8rem">${t('product_label')}: ${productText}</div>` : ''}
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
