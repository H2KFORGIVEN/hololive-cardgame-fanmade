import { getCard, getCardImage, localized } from '../core/CardDatabase.js';
import { MEMBER_STATE } from '../core/constants.js';

// Render a card at different sizes
// size: 'field' (100x140), 'hand' (180x252), 'mini' (60x84), 'preview' (280x392)
export function renderCard(instance, size = 'field', options = {}) {
  const card = getCard(instance.cardId);
  const imgSrc = getCardImage(instance.cardId);
  const isRest = instance.state === MEMBER_STATE.REST;
  const isFaceDown = instance.faceDown;

  // Session 1 VFX hooks:
  //   .vfx-just-placed — first frame after placedThisTurn flips
  //   .vfx-just-drew   — first frame after _drawnAt timestamp set
  //   .vfx-active      — caller (GameController) sets options.active when this
  //                      member can act (attack / collab / use oshi). Pulses
  //                      a golden border so the player sees what's available.
  const justDrewWindow = instance._drawnAt && (Date.now() - instance._drawnAt) < 900;
  const justPlacedWindow = instance.placedThisTurn && !instance._animShown;
  const classes = [
    'game-card',
    `card-${size}`,
    isRest ? 'card-rest' : '',
    isFaceDown ? 'card-facedown' : '',
    options.selectable ? 'card-selectable' : '',
    options.targetable ? 'card-targetable' : '',
    options.selected ? 'card-selected' : '',
    options.active ? 'vfx-active' : '',
    justPlacedWindow ? 'card-place-anim vfx-just-placed' : '',
    instance.bloomedThisTurn && !instance._bloomAnimShown ? 'card-bloom-anim' : '',
    !isFaceDown && justDrewWindow ? 'vfx-just-drew' : '',
  ].filter(Boolean).join(' ');

  const damageHtml = (!isFaceDown && instance.damage > 0)
    ? `<div class="card-damage-badge">${instance.damage}</div>`
    : '';

  // HP bar: only for members with hp, only on field size, only face-up
  const hpBarHtml = (!isFaceDown && size === 'field' && card?.hp)
    ? (() => {
        const remaining = Math.max(0, card.hp - (instance.damage || 0));
        const pct = Math.max(0, Math.min(100, (remaining / card.hp) * 100));
        const lvl = pct > 60 ? 'hp-high' : pct > 30 ? 'hp-mid' : 'hp-low';
        return `<div class="card-hp-bar ${lvl}" title="${remaining} / ${card.hp} HP">
          <div class="card-hp-fill" style="width:${pct}%"></div>
          <div class="card-hp-text">${remaining}/${card.hp}</div>
        </div>`;
      })()
    : '';

  const cheerCount = instance.attachedCheer?.length || 0;
  const cheerHtml = (!isFaceDown && cheerCount > 0)
    ? `<div class="card-cheer-badges">${renderCheerBadges(instance.attachedCheer)}</div>`
    : '';

  const supportCount = instance.attachedSupport?.length || 0;
  const supportHtml = (!isFaceDown && supportCount > 0)
    ? `<div class="card-support-badges">${renderSupportBadges(instance.attachedSupport)}</div>`
    : '';

  // Two card back types
  const isCheerBack = card && (card.type === '吶喊' || card.type === '主推');
  const backClass = isCheerBack ? 'card-back card-back-cheer' : 'card-back card-back-main';

  const imgHtml = isFaceDown
    ? `<div class="${backClass}"></div>`
    : `<img class="card-img" src="${imgSrc}" alt="${card?.name || ''}" loading="lazy" draggable="false">`;

  // Wrapper: support on LEFT, cheer on RIGHT
  return `
    <div class="card-with-attachments">
      ${supportHtml}
      <div class="${classes}" data-instance-id="${instance.instanceId}" data-card-id="${instance.cardId}">
        ${imgHtml}
        ${damageHtml}
        ${hpBarHtml}
      </div>
      ${cheerHtml}
    </div>
  `;
}

function renderCheerBadges(cheers) {
  return cheers.map((c, i) => {
    const img = getCardImage(c.cardId);
    return `<img class="attached-cheer-card" src="${img}" data-card-id="${c.cardId}" style="--idx:${i}" alt="" loading="lazy" draggable="false">`;
  }).join('');
}

function renderSupportBadges(supports) {
  return supports.map((c, i) => {
    const img = getCardImage(c.cardId);
    return `<img class="attached-support-card" src="${img}" data-card-id="${c.cardId}" style="--idx:${i}" alt="" loading="lazy" draggable="false">`;
  }).join('');
}

// Render card preview popup (large card + info)
export function renderCardPreview(cardId) {
  const card = getCard(cardId);
  if (!card) return '';
  const imgSrc = getCardImage(cardId);

  let info = `<div class="preview-name">${card.name}</div>`;
  info += `<div class="preview-id">${card.id}</div>`;
  if (card.type) info += `<div class="preview-type">${card.type}</div>`;
  if (card.hp) info += `<div class="preview-stat">HP: ${card.hp}</div>`;
  if (card.bloom) info += `<div class="preview-stat">Bloom: ${card.bloom}</div>`;
  if (card.color) info += `<div class="preview-stat">Color: ${card.color}</div>`;
  if (card.life) info += `<div class="preview-stat">Life: ${card.life}</div>`;

  // Effects
  const effects = [];
  if (card.oshiSkill) effects.push({ label: '推し技能', name: card.oshiSkill.name, text: localized(card.oshiSkill.effect), cost: card.oshiSkill.holoPower });
  if (card.spSkill) effects.push({ label: 'SP技能', name: card.spSkill.name, text: localized(card.spSkill.effect), cost: card.spSkill.holoPower });
  if (card.art1) effects.push({ label: 'Arts 1', name: card.art1.name, text: localized(card.art1.effect), damage: card.art1.damage });
  if (card.art2) effects.push({ label: 'Arts 2', name: card.art2.name, text: localized(card.art2.effect), damage: card.art2.damage });
  if (card.effectC) effects.push({ label: 'Collab', name: card.effectC.name, text: localized(card.effectC.effect) });
  if (card.effectB) effects.push({ label: 'Bloom', name: card.effectB.name, text: localized(card.effectB.effect) });
  if (card.supportEffect) effects.push({ label: '支援', text: localized(card.supportEffect) });

  const effectsHtml = effects.map(e =>
    `<div class="preview-effect">
      <div class="preview-effect-label">${e.label}${e.name ? ': ' + e.name : ''}${e.damage ? ' [' + e.damage + ']' : ''}${e.cost ? ' (HP:' + e.cost + ')' : ''}</div>
      ${e.text ? `<div class="preview-effect-text">${e.text}</div>` : ''}
    </div>`
  ).join('');

  return `
    <div class="card-preview">
      <img class="preview-img" src="${imgSrc}" alt="${card.name}">
      <div class="preview-info">
        ${info}
        ${effectsHtml}
      </div>
    </div>
  `;
}
