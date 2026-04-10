import { PHASE, ZONE, ACTION, isMember, isSupport } from '../core/constants.js';
import { getCard } from '../core/CardDatabase.js';

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
  const canBaton = !player.usedBaton && player.zones[ZONE.CENTER]
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
      <button class="action-btn" data-action="BATON_PASS" ${!canBaton ? 'disabled' : ''}>
        交棒
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

function renderPerformanceActions(state, player, p) {
  const center = player.zones[ZONE.CENTER];
  const collab = player.zones[ZONE.COLLAB];
  const centerCard = center ? getCard(center.cardId) : null;
  const collabCard = collab ? getCard(collab.cardId) : null;

  let html = '<div class="action-panel"><div class="action-section-label">表演階段</div>';

  if (center && !player.performedArts.center && center.state === 'active') {
    if (centerCard?.art1) {
      html += `<button class="action-btn action-art" data-action="USE_ART" data-position="center" data-art="0">
        ${centerCard.name} Arts1: ${centerCard.art1.name} [${centerCard.art1.damage || 0}]
      </button>`;
    }
    if (centerCard?.art2) {
      html += `<button class="action-btn action-art" data-action="USE_ART" data-position="center" data-art="1">
        ${centerCard.name} Arts2: ${centerCard.art2.name} [${centerCard.art2.damage || 0}]
      </button>`;
    }
  }

  if (collab && !player.performedArts.collab && collab.state === 'active') {
    if (collabCard?.art1) {
      html += `<button class="action-btn action-art" data-action="USE_ART" data-position="collab" data-art="0">
        ${collabCard.name} Arts1: ${collabCard.art1.name} [${collabCard.art1.damage || 0}]
      </button>`;
    }
    if (collabCard?.art2) {
      html += `<button class="action-btn action-art" data-action="USE_ART" data-position="collab" data-art="1">
        ${collabCard.name} Arts2: ${collabCard.art2.name} [${collabCard.art2.damage || 0}]
      </button>`;
    }
  }

  html += `<button class="action-btn action-manual" data-action="MANUAL_ADJUST">手動調整</button>`;
  html += `<hr class="action-divider">`;
  html += `<button class="action-btn action-primary" data-action="${ACTION.END_PERFORMANCE}">結束表演 →</button>`;
  html += '</div>';
  return html;
}
