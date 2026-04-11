import { PHASE, ZONE, ACTION, isMember, isSupport, parseCost } from '../core/constants.js';
import { getCard } from '../core/CardDatabase.js';
import { canPayArtCost } from '../core/ActionValidator.js';

export function renderActionPanel(state, onAction, localPlayer = null) {
  const p = state.activePlayer;
  const player = state.players[p];
  const phase = state.phase;
  const isMyTurn = localPlayer === null || localPlayer === p;

  if (phase === PHASE.GAME_OVER) {
    return `<div class="action-panel"><button class="action-btn" data-action="NEW_GAME">新遊戲</button></div>`;
  }

  // Not my turn: show waiting message only
  if (!isMyTurn) {
    const phaseLabels = { reset:'重置階段', draw:'抽牌階段', cheer:'應援階段', main:'主要階段', performance:'表演階段', end:'結束階段' };
    return `<div class="action-panel action-panel-center">
      <p class="action-hint">${phaseLabels[phase] || ''}</p>
      <p class="action-hint" style="opacity:.6">等待對手操作...</p>
    </div>`;
  }

  if (phase === PHASE.RESET || phase === PHASE.DRAW) {
    return `<div class="action-panel action-panel-center">
      <button class="action-btn action-primary" data-action="${ACTION.ADVANCE_PHASE}">繼續</button>
    </div>`;
  }

  if (phase === PHASE.CHEER) {
    return `<div class="action-panel">
      <p class="action-hint">選擇舞台上的成員接收吶喊卡</p>
    </div>`;
  }

  if (phase === PHASE.MAIN) {
    return renderMainActions(state, player, p);
  }

  if (phase === PHASE.PERFORMANCE) {
    return renderPerformanceActions(state, player, p);
  }

  return '<div class="action-panel"></div>';
}

function renderMainActions(state, player, p) {
  const hand = player.zones[ZONE.HAND];
  const hasDebutInHand = hand.some(c => {
    const card = getCard(c.cardId);
    return card && isMember(card.type) && (card.bloom === 'Debut' || card.bloom === 'Spot');
  });
  const hasBloomInHand = hand.some(c => {
    const card = getCard(c.cardId);
    return card && isMember(card.type) && card.bloom !== 'Debut' && card.bloom !== 'Spot';
  });
  const hasSupportInHand = hand.some(c => {
    const card = getCard(c.cardId);
    return card && isSupport(card.type);
  });
  const canCollab = !player.usedCollab && !player.zones[ZONE.COLLAB]
    && player.zones[ZONE.BACKSTAGE].length > 0 && player.zones[ZONE.DECK].length > 0;
  const center = player.zones[ZONE.CENTER];
  const centerCard = center ? getCard(center.cardId) : null;
  const batonCost = parseCost(centerCard?.batonImage);
  const canPayBaton = center ? canPayArtCost(center, batonCost) : false;
  const canBaton = !player.usedBaton && center && canPayBaton
    && player.zones[ZONE.BACKSTAGE].length > 0;

  const oshiCard = player.oshi ? getCard(player.oshi.cardId) : null;
  const oshiCost = Math.abs(oshiCard?.oshiSkill?.holoPower || 0);
  const spCost = Math.abs(oshiCard?.spSkill?.holoPower || 0);
  const holoPower = player.zones[ZONE.HOLO_POWER].length;

  return `
    <div class="action-panel">
      <div class="action-section-label">主要階段</div>
      <button class="action-btn" data-action="PLACE_MEMBER" ${!hasDebutInHand ? 'disabled title="手牌沒有 Debut/Spot 成員"' : ''}>
        放置成員
      </button>
      <button class="action-btn" data-action="BLOOM" ${(!hasBloomInHand || state.firstTurn[p]) ? `disabled title="${state.firstTurn[p] ? '第一回合不能綻放' : '手牌沒有可綻放的成員'}"` : ''}>
        綻放${state.firstTurn[p] ? ' (第一回合)' : ''}
      </button>
      <button class="action-btn" data-action="PLAY_SUPPORT" ${!hasSupportInHand ? 'disabled title="手牌沒有支援卡"' : ''}>
        使用支援卡
      </button>
      <button class="action-btn" data-action="COLLAB" ${!canCollab ? 'disabled' : ''}>
        聯動
      </button>
      <button class="action-btn" data-action="BATON_PASS" ${!canBaton ? `disabled title="${player.usedBaton ? '本回合已交棒' : !canPayBaton ? '吶喊卡不足' : ''}"` : ''}>
        交棒 ${batonCost.total > 0 ? '<span class="btn-cost">' + (centerCard?.batonImage || []).map(i => '<img class="cost-icon-sm" src="../images/' + i + '">').join('') + '</span>' : ''}
      </button>
      ${oshiCard?.oshiSkill ? `
        <button class="action-btn action-oshi" data-action="USE_OSHI_SKILL" data-skill="oshi" ${holoPower < oshiCost ? 'disabled' : ''}>
          推し技能 (${oshiCost})
        </button>
      ` : ''}
      ${oshiCard?.spSkill && !player.oshi.usedSp ? `
        <button class="action-btn action-sp" data-action="USE_OSHI_SKILL" data-skill="sp" ${holoPower < spCost ? 'disabled' : ''}>
          SP技能 (${spCost})
        </button>
      ` : ''}
      <button class="action-btn action-manual" data-action="MANUAL_ADJUST">
        手動調整
      </button>
      <hr class="action-divider">
      <button class="action-btn action-primary" data-action="${ACTION.END_MAIN_PHASE}">
        結束主要階段 →
      </button>
    </div>
  `;
}

function renderArtButton(member, memberCard, artKey, artIndex, position) {
  const art = memberCard?.[artKey];
  if (!art) return '';
  const cost = parseCost(art.image);
  const canPay = canPayArtCost(member, cost);
  const costIcons = (art.image || []).map(i => `<img class="cost-icon-sm" src="../images/${i}">`).join('');
  const spIcon = art.specialAttackImage ? `<img class="cost-icon-sm" src="../images/${art.specialAttackImage}">` : '';
  return `<button class="action-btn action-art" data-action="USE_ART" data-position="${position}" data-art="${artIndex}"
    ${!canPay ? `disabled title="吶喊卡不足"` : ''}>
    ${costIcons} ${memberCard.name}: ${art.name} [${art.damage || 0}] ${spIcon}
  </button>`;
}

function renderPerformanceActions(state, player, p) {
  const center = player.zones[ZONE.CENTER];
  const collab = player.zones[ZONE.COLLAB];
  const centerCard = center ? getCard(center.cardId) : null;
  const collabCard = collab ? getCard(collab.cardId) : null;

  let html = '<div class="action-panel"><div class="action-section-label">表演階段</div>';

  if (center && !player.performedArts.center && center.state === 'active') {
    html += renderArtButton(center, centerCard, 'art1', 0, 'center');
    html += renderArtButton(center, centerCard, 'art2', 1, 'center');
  }

  if (collab && !player.performedArts.collab && collab.state === 'active') {
    html += renderArtButton(collab, collabCard, 'art1', 0, 'collab');
    html += renderArtButton(collab, collabCard, 'art2', 1, 'collab');
  }

  html += `<button class="action-btn action-manual" data-action="MANUAL_ADJUST">手動調整</button>`;
  html += `<hr class="action-divider">`;
  html += `<button class="action-btn action-primary" data-action="${ACTION.END_PERFORMANCE}">結束表演 →</button>`;
  html += '</div>';
  return html;
}
