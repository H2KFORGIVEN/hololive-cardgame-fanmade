import { renderCard } from './CardRenderer.js';

// Render a zone with its cards
export function renderZone(zoneName, cards, options = {}) {
  const { layout = 'stack', label = '', selectable = false, targetable = false, emptyText = '', maxShow = 0 } = options;

  if (!cards && !options.singleCard) {
    return renderEmptyZone(zoneName, label, emptyText);
  }

  // Single card zone (center, collab)
  if (options.singleCard !== undefined) {
    const card = options.singleCard;
    if (!card) return renderEmptyZone(zoneName, label, emptyText);
    return `
      <div class="zone zone-${zoneName}" data-zone="${zoneName}">
        ${label ? `<div class="zone-label">${label}</div>` : ''}
        ${renderCard(card, 'field', { selectable, targetable })}
      </div>
    `;
  }

  // Array zones
  const arr = Array.isArray(cards) ? cards : [];

  if (layout === 'stack') {
    // Show count + top card only
    const topCard = arr.length > 0 ? arr[0] : null;
    return `
      <div class="zone zone-${zoneName} zone-stack" data-zone="${zoneName}">
        ${label ? `<div class="zone-label">${label}</div>` : ''}
        <div class="zone-count">${arr.length}</div>
        ${topCard ? renderCard(topCard, 'mini', { selectable: false }) : `<div class="zone-empty-slot"></div>`}
      </div>
    `;
  }

  if (layout === 'row') {
    // Show all cards in a horizontal row
    const visible = maxShow > 0 ? arr.slice(0, maxShow) : arr;
    const remaining = maxShow > 0 && arr.length > maxShow ? arr.length - maxShow : 0;
    return `
      <div class="zone zone-${zoneName} zone-row" data-zone="${zoneName}">
        ${label ? `<div class="zone-label">${label}</div>` : ''}
        <div class="zone-cards-row">
          ${visible.map(c => renderCard(c, 'field', { selectable, targetable })).join('')}
          ${remaining > 0 ? `<div class="zone-more">+${remaining}</div>` : ''}
        </div>
      </div>
    `;
  }

  if (layout === 'fan') {
    // Hand cards - larger, overlapping fan
    return `
      <div class="zone zone-${zoneName} zone-fan" data-zone="${zoneName}">
        ${arr.map((c, i) => `
          <div class="fan-card" style="--fan-index:${i};--fan-total:${arr.length}">
            ${renderCard(c, 'hand', { selectable })}
          </div>
        `).join('')}
      </div>
    `;
  }

  return '';
}

function renderEmptyZone(zoneName, label, emptyText) {
  return `
    <div class="zone zone-${zoneName} zone-empty" data-zone="${zoneName}">
      ${label ? `<div class="zone-label">${label}</div>` : ''}
      <div class="zone-empty-slot">${emptyText || ''}</div>
    </div>
  `;
}
