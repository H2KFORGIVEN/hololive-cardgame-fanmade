import { t, localized } from '../i18n.js';
import { escape as _e } from './_escape.js';

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

let _rulesData = null;

export function renderCardGallery(container, cards, filters, rulesData) {
  _rulesData = rulesData;
  filteredCards = applyFilters(cards, filters);
  currentPage = 0;
  renderPage(container);
}

function _effectText(obj) {
  if (!obj) return '';
  const eff = obj.effect;
  return typeof eff === 'object' ? localized(eff) : (eff || '');
}

function deduplicateById(cards) {
  const seen = new Set();
  return cards.filter(card => {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
}

function applyFilters(cards, filters) {
  return deduplicateById(cards).filter(card => {
    // Color filter — only applies to non-support cards (support cards have no color)
    if (filters.color && filters.color !== 'all') {
      if (card.type?.startsWith('支援')) return false; // hide supports when color filter active
      if (card.color !== filters.color) return false;
    }
    if (filters.type && filters.type !== 'all') {
      // Support subtype: 'support_工作人員', 'support_活動', etc.
      if (filters.type.startsWith('support_')) {
        const sub = filters.type.slice(8);
        if (card.type !== '支援・' + sub) return false;
      } else if (filters.type === 'support') {
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
  const restricted = new Set(_rulesData?.restricted_cards || []);
  const errata = _rulesData?.errata || {};

  for (const card of visible) {
    const color = COLOR_MAP[card.color] || '#666';
    const isRestricted = restricted.has(card.id);
    const hasErrata = card.id in errata;
    let badgesHtml = '';
    if (isRestricted) badgesHtml += `<span class="card-rule-badge restricted" title="${t('rule_restricted_desc')}">${t('rule_restricted')}</span>`;
    if (hasErrata) badgesHtml += `<span class="card-rule-badge errata" title="${t('rule_errata_desc')}">${t('rule_errata')}</span>`;

    html += `
      <div class="gallery-card" data-card-id="${_e(card.id)}">
        <div class="gallery-card-img-wrap">
          <img class="gallery-card-img gallery-card-img-autohide" src="${_e(card.imageUrl || '')}" alt="${_e(card.name)}" loading="lazy">
          ${badgesHtml ? `<div class="card-rule-badges">${badgesHtml}</div>` : ''}
        </div>
        <div class="gallery-card-info">
          <div class="gallery-card-name" title="${_e(card.name)}">${_e(card.name)}</div>
          <div class="gallery-card-meta">
            <span class="gallery-card-color" style="background:${color}"></span>
            <span>${_e(card.type || '')}</span>
            ${card.bloom ? `<span>· ${_e(card.bloom)}</span>` : ''}
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

  // Hide broken images without inline onerror (safer + CSP-friendly)
  container.querySelectorAll('img.gallery-card-img-autohide').forEach(img => {
    img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
  });

  if (hasMore) {
    document.getElementById('loadMoreCards')?.addEventListener('click', () => {
      currentPage++;
      renderPage(container);
    });
  }
}

export function renderCardDetail(container, card, allCards, rulesData) {
  if (!card) {
    container.innerHTML = `<p>${t('card_not_found')}</p>`;
    return;
  }

  // Merge data variants (different entries in cards.json with same id) with local image variants
  const dataVariants = allCards ? allCards.filter(c => c.id === card.id) : [card];
  const dataUrls = new Set(dataVariants.map(v => v.imageUrl));

  // Add extra local image variants from allImages that aren't already in data variants
  const extraVariants = [];
  if (card.allImages) {
    for (const imgPath of card.allImages) {
      if (!dataUrls.has(imgPath)) {
        extraVariants.push({ ...card, imageUrl: imgPath, _extraVariant: true });
      }
    }
  }
  const variants = [...dataVariants, ...extraVariants];

  const isOshi = card.type === '主推';
  const isMember = card.type === '成員';
  const isSupport = card.type?.startsWith('支援');
  const isCheer = card.type === '吶喊';

  let statsHtml = '';
  if (isOshi) {
    statsHtml = `
      <div class="stat-label">${t('stat_life')}</div><div class="stat-value">${_e(card.life || '?')}</div>
      <div class="stat-label">${t('stat_color')}</div><div class="stat-value">${_e(card.color || '?')}</div>
    `;
  } else if (isMember) {
    const batonIcons = (card.batonImage || []).map(i => `<img class="cost-icon" src="images/${_e(i)}" alt="">`).join('');
    statsHtml = `
      <div class="stat-label">${t('stat_hp')}</div><div class="stat-value">${_e(card.hp || '?')}</div>
      <div class="stat-label">${t('stat_bloom')}</div><div class="stat-value">${_e(card.bloom || '?')}</div>
      <div class="stat-label">${t('stat_color')}</div><div class="stat-value">${_e(card.color || '?')}</div>
      ${batonIcons ? `<div class="stat-label">交棒</div><div class="stat-value stat-icons">${batonIcons}</div>` : ''}
    `;
  } else if (isSupport || isCheer) {
    statsHtml = `
      <div class="stat-label">${t('stat_type')}</div><div class="stat-value">${_e(card.type)}</div>
      ${card.color ? `<div class="stat-label">${t('stat_color')}</div><div class="stat-value">${_e(card.color)}</div>` : ''}
    `;
  }

  let effectsHtml = '';

  if (isOshi) {
    if (card.oshiSkill) {
      effectsHtml += renderEffect(t('effect_oshi_skill') + ': ' + _e(card.oshiSkill.name), _effectText(card.oshiSkill), `HP: ${_e(card.oshiSkill.holoPower)}`);
    }
    if (card.spSkill) {
      effectsHtml += renderEffect(t('effect_sp') + ': ' + _e(card.spSkill.name), _effectText(card.spSkill), `HP: ${_e(card.spSkill.holoPower)}`);
    }
  } else if (isMember) {
    const effectKeys = [['effectC', 'effect_collab'], ['effectB', 'effect_bloom'], ['effectG', 'effect_gift']];
    for (const [key, i18nKey] of effectKeys) {
      const eff = card[key];
      if (eff) effectsHtml += renderEffect(`${t(i18nKey)}: ${_e(eff.name)}`, _effectText(eff));
    }
    if (card.art1) {
      const artIcons = (card.art1.image || []).map(i => `<img class="cost-icon" src="images/${_e(i)}" alt="">`).join('');
      const spAtk = card.art1.specialAttackImage ? ` <img class="cost-icon cost-sp" src="images/${_e(card.art1.specialAttackImage)}" alt="">` : '';
      const artEffect = _effectText(card.art1);
      // Title carries HTML (icons); text is plain (renderEffect escapes it)
      effectsHtml += renderEffect(
        `${artIcons} ${t('effect_arts')}: ${_e(card.art1.name)}${spAtk}`,
        [card.art1.damage ? `${t('stat_damage')}: ${card.art1.damage}` : '', artEffect].filter(Boolean).join('\n')
      );
    }
    if (card.art2) {
      const artIcons = (card.art2.image || []).map(i => `<img class="cost-icon" src="images/${_e(i)}" alt="">`).join('');
      const spAtk = card.art2.specialAttackImage ? ` <img class="cost-icon cost-sp" src="images/${_e(card.art2.specialAttackImage)}" alt="">` : '';
      const artEffect = _effectText(card.art2);
      effectsHtml += renderEffect(
        `${artIcons} ${t('effect_arts2')}: ${_e(card.art2.name)}${spAtk}`,
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
    ? String(card.tag).split('/').map(tg => `<span class="tag-chip">${_e(tg.trim())}</span>`).join('')
    : '';

  const productText = Array.isArray(card.product) ? card.product.join(', ') : (card.product || '');

  const restricted = new Set(rulesData?.restricted_cards || []);
  const errataMap = rulesData?.errata || {};
  const isRestricted = restricted.has(card.id);
  const errataInfo = errataMap[card.id];
  const relatedArticles = (rulesData?.articles || []).filter(a => a.card_ids?.includes(card.id));

  let ruleSectionHtml = '';
  if (isRestricted || errataInfo || relatedArticles.length) {
    let badges = '';
    if (isRestricted) badges += `<span class="card-rule-badge restricted">${t('rule_restricted')}</span>`;
    if (errataInfo) badges += `<span class="card-rule-badge errata">${t('rule_errata')}</span>`;

    let articlesListHtml = '';
    if (relatedArticles.length) {
      articlesListHtml = relatedArticles.map(a => {
        const title = typeof a.title === 'object' ? localized(a.title) : a.title;
        return `<li class="rule-article-item">
          <span class="rule-article-date">${_e(a.date || '')}</span>
          <a href="${_e(a.url || '')}" target="_blank" rel="noopener" class="rule-article-link">${_e(title)}</a>
        </li>`;
      }).join('');
    }

    ruleSectionHtml = `
      <div class="card-rule-section">
        <div class="card-rule-badges-detail">${badges}</div>
        ${isRestricted ? `<div class="card-rule-note restricted-note">${t('rule_restricted_desc')}</div>` : ''}
        ${errataInfo ? `<div class="card-rule-note errata-note">${t('rule_errata_desc')}</div>` : ''}
        ${articlesListHtml ? `<div class="card-rule-articles">
          <div class="card-rule-articles-title">${t('rule_articles_title')}</div>
          <ul class="rule-articles-list">${articlesListHtml}</ul>
        </div>` : ''}
      </div>
    `;
  }

  const variantsHtml = variants.length > 1
    ? `<div class="card-variants">
        <div class="card-variants-label">${t('card_variants', { count: variants.length })}</div>
        <div class="card-variants-grid">
          ${variants.map((v, i) => {
            const suffix = _rarityLabel(v.imageUrl);
            return `<div class="card-variant-thumb${i === 0 ? ' active' : ''}" data-variant-idx="${i}">
              <img src="${_e(v.imageUrl)}" alt="${_e(suffix)}" loading="lazy">
              <span class="card-variant-rarity">${_e(suffix)}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`
    : '';

  container.innerHTML = `
    <div class="card-detail">
      <img class="card-detail-img" id="cardDetailMainImg" src="${_e(card.imageUrl || '')}" alt="${_e(card.name)}">
      <div class="card-detail-info">
        <div class="card-detail-name">${_e(card.name)}</div>
        <div class="card-detail-id">${_e(card.id)}</div>
        ${ruleSectionHtml}
        ${tagsHtml ? `<div class="card-detail-tags">${tagsHtml}</div>` : ''}
        <div class="card-detail-stats">${statsHtml}</div>
        ${productText ? `<div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.8rem">${t('product_label')}: ${_e(productText)}</div>` : ''}
        ${variantsHtml}
        <div class="card-detail-effects">${effectsHtml}</div>
      </div>
    </div>
  `;

  if (variants.length > 1) {
    const mainImg = container.querySelector('#cardDetailMainImg');
    container.querySelectorAll('.card-variant-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        const idx = parseInt(thumb.dataset.variantIdx);
        mainImg.src = variants[idx].imageUrl;
        container.querySelectorAll('.card-variant-thumb').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
      });
    });
  }
}

const RARITY_SUFFIXES = {
  'C': 'C', 'U': 'U', 'R': 'R', 'RR': 'RR', 'SR': 'SR',
  'OSR': 'OSR', 'OUR': 'OUR', 'SEC': 'SEC', 'SSP': 'SSP',
  'SP': 'SP', 'UR': 'UR', 'SER': 'SER',
};

function _rarityLabel(url) {
  if (!url) return '?';
  const filename = url.split('/').pop().replace('.png', '').replace('.jpg', '');
  const parts = filename.split('_');
  parts.shift();
  const suffix = parts.join('_');
  for (const [key, label] of Object.entries(RARITY_SUFFIXES)) {
    if (suffix === key) return label;
  }
  if (suffix.startsWith('P')) return 'P';
  return suffix || '?';
}

function renderEffect(title, text, subtitle) {
  if (!text) return '';
  // title is pre-composed safe HTML (icons + already-escaped names)
  // text/subtitle are plain text — escape and convert \n → <br> for display
  const textHtml = _e(text).replace(/\n/g, '<br>');
  return `
    <div class="effect-block">
      <div class="effect-name">${title}${subtitle ? ` <span style="color:var(--text-secondary);font-size:0.75rem">(${_e(subtitle)})</span>` : ''}</div>
      <div class="effect-text">${textHtml}</div>
    </div>
  `;
}
