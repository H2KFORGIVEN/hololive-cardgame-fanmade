import { t, getLang } from '../i18n.js';
import { escape as _escape } from './_escape.js';

// Category filter chips shown at the top. 'all' = no filter.
const CATEGORIES = ['all', 'tournament', 'usage_rate', 'news'];

let _filter = 'all';

export function renderNewsView(container, feedData) {
  const feed = Array.isArray(feedData) ? feedData : [];

  if (!feed.length) {
    container.innerHTML = `
      <div class="xfeed-header">
        <h2 class="xfeed-title">${t('news_title')}</h2>
        <p class="xfeed-desc">${t('news_desc')}</p>
      </div>
      <div class="xfeed-empty">${t('news_empty')}</div>
    `;
    return;
  }

  const counts = {
    all: feed.length,
    tournament: feed.filter(f => f.category === 'tournament').length,
    usage_rate: feed.filter(f => f.category === 'usage_rate').length,
    news: feed.filter(f => f.category === 'news').length,
  };
  const filtered = _filter === 'all' ? feed : feed.filter(f => f.category === _filter);

  const chips = CATEGORIES.map(c => {
    const label = t('news_cat_' + c);
    const active = c === _filter ? ' active' : '';
    const count = counts[c] ?? 0;
    return `<button class="xfeed-chip${active}" data-cat="${c}">${label}<span class="xfeed-chip-count">${count}</span></button>`;
  }).join('');

  const cards = filtered.map(renderFeedCard).join('');

  container.innerHTML = `
    <div class="xfeed-header">
      <h2 class="xfeed-title">${t('news_title')}</h2>
      <p class="xfeed-desc">${t('news_desc')}</p>
    </div>
    <div class="xfeed-chips">${chips}</div>
    <div class="xfeed-feed">${cards}</div>
  `;

  // Click handlers
  container.querySelectorAll('.xfeed-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      _filter = btn.dataset.cat;
      renderNewsView(container, feedData);
    });
  });

  // Image lightbox: click any tweet photo to view full size
  container.querySelectorAll('.xfeed-media-photo').forEach(img => {
    img.addEventListener('click', e => {
      e.stopPropagation();
      _showLightbox(img.dataset.src);
    });
  });
}

function renderFeedCard(entry) {
  const author = entry.author || {};
  const avatar = author.avatar
    ? `<img class="xfeed-avatar" src="${_escape(author.avatar)}" alt="${_escape(author.name)}" loading="lazy">`
    : `<div class="xfeed-avatar xfeed-avatar-fallback">@</div>`;

  const dateStr = _formatDate(entry.created_at);
  const categoryLabel = t('news_cat_' + (entry.category || 'all'));
  const categoryClass = entry.category ? ` xfeed-cat-${entry.category}` : '';

  const textHtml = _linkify(_escape(entry.text || ''));

  const media = entry.media || [];
  let mediaHtml = '';
  if (media.length) {
    const classMod = media.length === 1 ? 'xfeed-media-single' :
                     media.length === 2 ? 'xfeed-media-double' :
                     media.length === 3 ? 'xfeed-media-triple' : 'xfeed-media-quad';
    mediaHtml = `<div class="xfeed-media ${classMod}">${media.map(renderMediaItem).join('')}</div>`;
  }

  const hashtags = (entry.hashtags || []).length
    ? `<div class="xfeed-hashtags">${entry.hashtags.map(h => `<span class="xfeed-hashtag">#${_escape(h)}</span>`).join('')}</div>`
    : '';

  const externals = (entry.external_urls || []).length
    ? `<div class="xfeed-externals">${entry.external_urls.map(u =>
        `<a class="xfeed-external" href="${_escape(u.url)}" target="_blank" rel="noopener">🔗 ${_escape(u.display)}</a>`
      ).join('')}</div>`
    : '';

  const stats = entry.favorite_count
    ? `<span class="xfeed-stat">♥ ${_formatCount(entry.favorite_count)}</span>`
    : '';

  return `
    <article class="xfeed-card${categoryClass}" data-tweet-id="${_escape(entry.id)}">
      <header class="xfeed-card-header">
        ${avatar}
        <div class="xfeed-author-info">
          <span class="xfeed-author-name">${_escape(author.name || '')}</span>
          <span class="xfeed-author-handle">@${_escape(author.handle || '')}</span>
        </div>
        <span class="xfeed-category-badge${categoryClass}">${categoryLabel}</span>
      </header>
      <div class="xfeed-card-body">
        <div class="xfeed-text">${textHtml}</div>
        ${mediaHtml}
        ${hashtags}
        ${externals}
      </div>
      <footer class="xfeed-card-footer">
        <span class="xfeed-date">${dateStr}</span>
        ${stats}
        <a class="xfeed-source-link" href="${_escape(entry.url)}" target="_blank" rel="noopener">
          ${t('news_view_on_x')} ↗
        </a>
      </footer>
    </article>
  `;
}

function renderMediaItem(m) {
  if (m.type === 'video' || m.type === 'animated_gif') {
    const poster = m.poster || m.url || '';
    const vurl = m.video_url || '';
    if (vurl) {
      return `
        <video class="xfeed-media-video" controls ${m.type === 'animated_gif' ? 'autoplay muted loop' : ''} poster="${_escape(poster)}" preload="metadata">
          <source src="${_escape(vurl)}" type="video/mp4">
        </video>`;
    }
    // Fallback to poster image if we lost the mp4 URL somewhere
    return `<img class="xfeed-media-photo" src="${_escape(poster)}" alt="" data-src="${_escape(poster)}" loading="lazy">`;
  }
  // photo
  return `<img class="xfeed-media-photo" src="${_escape(m.url || '')}" alt="" data-src="${_escape(m.url || '')}" loading="lazy">`;
}

// ─── helpers ──────────────────────────────────────────────────────────

// _escape imported from ./_escape.js above — shared helper

function _linkify(escapedText) {
  // Very small linkify pass on already-html-escaped text.
  // Catches bare http(s) URLs that the tweet text expanded into.
  return escapedText
    .replace(/\n/g, '<br>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="xfeed-inline-link">$1</a>');
}

function _formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const lang = getLang();
  try {
    return d.toLocaleString(lang === 'zh-TW' ? 'zh-TW' : lang, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return d.toISOString().replace('T', ' ').slice(0, 16);
  }
}

function _formatCount(n) {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return Math.round(n / 1000) + 'K';
}

// ─── lightbox ─────────────────────────────────────────────────────────

let _lightbox = null;
function _showLightbox(src) {
  if (!src) return;
  if (!_lightbox) {
    _lightbox = document.createElement('div');
    _lightbox.className = 'xfeed-lightbox';
    _lightbox.innerHTML = '<img class="xfeed-lightbox-img" alt="">';
    _lightbox.addEventListener('click', () => _lightbox.classList.remove('open'));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && _lightbox.classList.contains('open')) _lightbox.classList.remove('open');
    });
    document.body.appendChild(_lightbox);
  }
  _lightbox.querySelector('img').src = src;
  _lightbox.classList.add('open');
}
