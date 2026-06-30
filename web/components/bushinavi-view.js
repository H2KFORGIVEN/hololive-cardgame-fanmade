import { t } from '../i18n.js';
import { escape as _escape } from './_escape.js';

// State for the Bushi-Navi tab — which event is expanded (to show full ranking)
const _state = {
  expanded: new Set(),
  dateFilter: 'all',  // 'all' | '30d' | '90d' | '180d'
};

/**
 * Render the Bushi-Navi events list inside `container`.
 *   events: array from web/data/bushinavi_events.json
 *   decks:  dict from web/data/bushinavi_decks.json (deck_code → {oshi_cards, main_deck, cheer_deck, ...})
 *   cardsData: full cards array for name/image lookups inside the deck modal
 *   onDeckClick: callback(deckCode) → parent shows deck modal with resolved deck data
 */
export function renderBushinaviView(container, events, decks, cardsData, onDeckClick) {
  const list = Array.isArray(events) ? events : [];
  if (!list.length) {
    container.innerHTML = `
      <div class="bn-header">
        <h2 class="bn-title">${t('bn_title')}</h2>
        <p class="bn-desc">${t('bn_desc')}</p>
      </div>
      <div class="bn-empty">${t('bn_empty')}</div>`;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const cutoff = _cutoffDate(_state.dateFilter, today);
  const filtered = cutoff ? list.filter(e => (e.event_date || '') >= cutoff) : list;

  // Group by date (YYYY-MM-DD) so closely-dated tournaments cluster
  const chips = ['all', '30d', '90d', '180d'].map(k => {
    const active = k === _state.dateFilter ? ' active' : '';
    const count = k === 'all' ? list.length : list.filter(e => (e.event_date || '') >= _cutoffDate(k, today)).length;
    return `<button class="bn-chip${active}" data-range="${k}">${t('bn_range_' + k)}<span class="bn-chip-count">${count}</span></button>`;
  }).join('');

  // Sort: newest first (already sorted but be safe)
  const sorted = [...filtered].sort((a, b) => (b.event_date || '').localeCompare(a.event_date || ''));

  const cards = sorted.map(e => _renderEventCard(e, decks)).join('');

  container.innerHTML = `
    <div class="bn-header">
      <h2 class="bn-title">${t('bn_title')}</h2>
      <p class="bn-desc">${t('bn_desc')}</p>
      <p class="bn-source-note">${t('bn_source_note')}</p>
    </div>
    <div class="bn-chips">${chips}</div>
    <div class="bn-events">${cards}</div>
  `;

  // Date-range chip clicks
  container.querySelectorAll('.bn-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      _state.dateFilter = btn.dataset.range;
      renderBushinaviView(container, events, decks, cardsData, onDeckClick);
    });
  });

  // Event expand/collapse
  container.querySelectorAll('.bn-event-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.eventId;
      if (_state.expanded.has(id)) _state.expanded.delete(id);
      else _state.expanded.add(id);
      renderBushinaviView(container, events, decks, cardsData, onDeckClick);
    });
  });

  // Deck code clicks → open modal
  container.querySelectorAll('[data-deck-code]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const code = el.dataset.deckCode;
      if (code && onDeckClick) onDeckClick(code);
    });
  });
}

function _cutoffDate(range, today) {
  if (range === 'all') return '';
  const days = { '30d': 30, '90d': 90, '180d': 180 }[range] || 0;
  if (!days) return '';
  const d = new Date(today);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function _renderEventCard(event, decks) {
  const id = String(event.event_id);
  const isExpanded = _state.expanded.has(id);
  const rankings = event.rankings || [];
  const topPreview = rankings.slice(0, 3);
  const shownRankings = isExpanded ? rankings : topPreview;

  const joinInfo = event.joined_player_count
    ? `<span class="bn-event-count">${event.joined_player_count}${event.max_join_count ? '/' + event.max_join_count : ''} 人</span>`
    : '';

  const place = event.place
    ? `<span class="bn-event-place">${_escape(event.place.slice(0, 40))}</span>`
    : '';

  const rankRows = shownRankings.map(r => _renderRankRow(r, decks)).join('');

  const remaining = rankings.length - topPreview.length;
  const toggleBtn = rankings.length > 3
    ? `<button type="button" class="bn-event-toggle" data-event-id="${id}">
         ${isExpanded ? t('bn_collapse') : t('bn_show_all', { n: remaining })}
       </button>`
    : '';

  return `
    <article class="bn-event" data-event-id="${id}">
      <header class="bn-event-header">
        <div class="bn-event-main">
          <div class="bn-event-title">${_escape(event.series_title || event.event_title)}</div>
          <div class="bn-event-sub">
            <span class="bn-event-date">${event.event_date || ''}</span>
            ${place}
            ${joinInfo}
            ${event.game_format ? `<span class="bn-event-format">${_escape(event.game_format)}</span>` : ''}
          </div>
        </div>
        <a class="bn-event-source" href="${_escape(event.source_url)}" target="_blank" rel="noopener" title="Bushi-Navi">
          ↗
        </a>
      </header>
      <ol class="bn-rankings" start="1">
        ${rankRows}
      </ol>
      ${toggleBtn}
    </article>
  `;
}

function _renderRankRow(rank, decks) {
  const medal = rank.reward_image_local || rank.reward_image_url || '';
  const medalHtml = medal
    ? `<img class="bn-medal" src="${_escape(medal)}" alt="rank ${_escape(rank.rank)} badge" loading="lazy">`
    : `<div class="bn-medal bn-medal-fallback">${_escape(rank.rank || '-')}</div>`;

  const code = rank.deck_code || '';
  const hasDeck = !!code;

  const deckBtnClass = hasDeck ? 'bn-deck-link clickable' : 'bn-deck-link disabled';
  const deckBtnAttr = hasDeck ? `data-deck-code="${_escape(code)}"` : '';

  return `
    <li class="bn-rank-row">
      <div class="bn-rank-num">#${rank.rank || '-'}</div>
      ${medalHtml}
      <div class="bn-rank-info">
        <div class="bn-rank-player">${_escape(rank.player_name || '')}</div>
        <div class="bn-rank-meta">
          ${rank.oshi ? `<span class="bn-rank-oshi">${_escape(rank.oshi)}</span>` : ''}
          ${rank.friend_code ? `<span class="bn-rank-friend">#${_escape(rank.friend_code)}</span>` : ''}
        </div>
      </div>
      ${hasDeck
        ? `<button type="button" class="${deckBtnClass}" ${deckBtnAttr}>
             ${t('bn_view_deck')}
           </button>`
        : `<span class="${deckBtnClass}">${t('bn_no_deck')}</span>`
      }
    </li>
  `;
}

// _escape imported from ./_escape.js above — shared helper
