import { ZONE, PHASE, MEMBER_STATE } from '../core/constants.js';
import { getCard, getCardImage, localized } from '../core/CardDatabase.js';
import { renderCard, renderCardPreview } from './CardRenderer.js';
import { renderPhaseBar } from './PhaseBar.js';
import { renderActionPanel } from './ActionPanel.js';

export function renderGameBoard(state, localPlayer) {
  const opponent = 1 - localPlayer;
  const isMyTurn = state.activePlayer === localPlayer;

  return `
    <div class="game-container">
      <!-- Top HUD: prominent phase + turn indicator (full width) -->
      <div class="top-hud ${isMyTurn ? 'hud-my-turn' : 'hud-opp-turn'}">
        ${renderPhaseBar(state, localPlayer)}
      </div>

      <div class="board">
        <!-- Opponent field (top, mirrored) -->
        <div class="player-field opponent-field ${!isMyTurn ? 'field-active' : 'field-idle'}">
          ${renderPlayerField(state, opponent, localPlayer, true)}
        </div>

        <!-- Divider -->
        <div class="board-divider">
          <span class="vs-text">VS</span>
        </div>

        <!-- Local player field (bottom) -->
        <div class="player-field local-field ${isMyTurn ? 'field-active' : 'field-idle'}">
          ${renderPlayerField(state, localPlayer, localPlayer, false)}
        </div>
      </div>

      <!-- Hand -->
      <div class="hand-area">
        ${renderHand(state, localPlayer)}
      </div>

      <!-- Side panels (now just action panel — phase moved to top HUD) -->
      <div class="side-panels">
        <div class="action-panel-wrap" id="actionPanel">
          ${renderActionPanel(state, null, localPlayer)}
        </div>
      </div>

      <!-- Floating log button (left side) -->
      <button class="log-toggle-btn" id="logToggleBtn" title="操作紀錄">📜</button>
      <div class="log-popup" id="logPopup" hidden>
        ${renderLog(state)}
      </div>

      <!-- Card preview popup -->
      <div class="card-preview-popup" id="cardPreview" hidden></div>
    </div>
  `;
}

function renderPlayerField(state, playerIdx, localPlayer, isOpponent) {
  const player = state.players[playerIdx];
  const isActive = state.activePlayer === playerIdx;
  const selectable = isActive && !isOpponent;
  const targetable = isActive && isOpponent && state.phase === PHASE.PERFORMANCE;
  // Session 1: golden pulse for cards that can act this turn (own side only,
  // performance phase, member is ACTIVE state, hasn't yet performed in that
  // position). Lets the player see at a glance which cards still have an art.
  const canAttackThisTurn = (m, position) => {
    if (!m || isOpponent) return false;
    if (!isActive) return false;
    if (state.phase !== PHASE.PERFORMANCE) return false;
    if (m.state !== MEMBER_STATE.ACTIVE) return false;
    if (player.performedArts?.[position]) return false;
    return true;
  };

  return `
    <div class="playsheet-field ${isOpponent ? 'field-mirrored' : ''}">
      <img class="playsheet-bg" src="../images/brand/playsheet_clean.jpg" alt="">

      <!-- 9: Cheer Deck (face-down vertical) -->
      <div class="zone-pos zone-cheer-deck">
        ${renderFaceDownDeck(player.zones[ZONE.CHEER_DECK].length, 'cheer', 'Cheer')}
      </div>

      <!-- 3: Collab -->
      <div class="zone-pos zone-collab">
        ${renderSingleCardZone(player.zones[ZONE.COLLAB], 'Collab', selectable && state.phase === PHASE.MAIN, targetable, canAttackThisTurn(player.zones[ZONE.COLLAB], 'collab'))}
      </div>

      <!-- 2: Center -->
      <div class="zone-pos zone-center">
        ${renderSingleCardZone(player.zones[ZONE.CENTER], 'Center', selectable && state.phase === PHASE.MAIN, targetable, canAttackThisTurn(player.zones[ZONE.CENTER], 'center'))}
      </div>

      <!-- 1: Oshi -->
      <div class="zone-pos zone-oshi-pos">
        ${renderOshiPos(player)}
      </div>

      <!-- 7: Holo Power (horizontal stacked, uses dedicated holopower back) -->
      <div class="zone-pos zone-holo-power">
        ${renderHorizontalStack(player.zones[ZONE.HOLO_POWER], 'HoloP', 'holopower')}
      </div>

      <!-- 5: Deck (face-down vertical) -->
      <div class="zone-pos zone-deck">
        ${renderFaceDownDeck(player.zones[ZONE.DECK].length, 'main', 'Deck')}
      </div>

      <!-- 8: Life (horizontal stacked, uses dedicated life back) -->
      <div class="zone-pos zone-life">
        ${renderHorizontalStack(player.zones[ZONE.LIFE], 'Life', 'life')}
      </div>

      <!-- 4: Backstage (3 slots wide) -->
      <div class="zone-pos zone-backstage">
        ${renderBackstageRow(player.zones[ZONE.BACKSTAGE], selectable && state.phase === PHASE.MAIN)}
      </div>

      <!-- 6: Archive (face-up stack, top card visible) -->
      <div class="zone-pos zone-archive">
        ${renderArchiveStack(player.zones[ZONE.ARCHIVE])}
      </div>
    </div>
  `;
}

function renderSingleCardZone(card, label, selectable, targetable, active = false) {
  if (!card) {
    return `<div class="zone-card-slot empty-slot"></div>`;
  }
  return `<div class="zone-card-slot">
    ${renderCard(card, 'field', { selectable, targetable, active })}
  </div>`;
}

function renderFaceDownDeck(count, backType, label) {
  if (count === 0) {
    return `<div class="zone-card-slot empty-slot"></div>`;
  }
  return `<div class="zone-card-slot deck-stack">
    <div class="card-back card-back-${backType}"></div>
    <div class="zone-count-badge">${count}</div>
  </div>`;
}

function renderHorizontalStack(cards, label, backType) {
  if (!cards || cards.length === 0) {
    return `<div class="zone-card-slot empty-slot"></div>`;
  }
  const maxShow = Math.min(cards.length, 6);
  let html = `<div class="horizontal-stack">`;
  for (let i = 0; i < maxShow; i++) {
    html += `<div class="h-stack-card card-back card-back-${backType}" style="--idx:${i}"></div>`;
  }
  if (cards.length > 1) html += `<div class="zone-count-badge">${cards.length}</div>`;
  html += `</div>`;
  return html;
}

function renderBackstageRow(cards, selectable) {
  if (!cards || cards.length === 0) {
    return `<div class="backstage-row empty-row"></div>`;
  }
  let html = `<div class="backstage-row">`;
  for (let i = 0; i < cards.length; i++) {
    html += `<div class="backstage-slot">${renderCard(cards[i], 'field', { selectable })}</div>`;
  }
  html += `</div>`;
  return html;
}

function renderArchiveStack(cards) {
  if (!cards || cards.length === 0) {
    return `<div class="zone-card-slot empty-slot"></div>`;
  }
  const top = cards[cards.length - 1];
  return `<div class="zone-card-slot">
    ${renderCard(top, 'field', {})}
    ${cards.length > 1 ? `<div class="zone-count-badge">${cards.length}</div>` : ''}
  </div>`;
}

function renderOshiPos(player) {
  if (!player.oshi) return '<div class="oshi-empty">No Oshi</div>';
  const card = getCard(player.oshi.cardId);
  const img = getCardImage(player.oshi.cardId);
  return `
    <div class="oshi-pos-card" data-card-id="${player.oshi.cardId}">
      <img src="${img}" alt="${card?.name || ''}">
      ${player.oshi.usedSp ? '<span class="oshi-sp-used">SP</span>' : ''}
    </div>
  `;
}

function renderHand(state, localPlayer) {
  const hand = state.players[localPlayer].zones[ZONE.HAND];
  const isActive = state.activePlayer === localPlayer;
  const now = Date.now();
  const ANIM_WINDOW = 1500;

  return `
    <div class="hand-cards">
      ${hand.map((c, i) => {
        const drawnAt = c._drawnAt || 0;
        const age = now - drawnAt;
        const shouldAnimate = drawnAt && age < ANIM_WINDOW;
        const delay = shouldAnimate ? Math.max(0, drawnAt - now) : 0;
        const animClass = shouldAnimate ? 'card-draw-animating' : '';
        const animStyle = shouldAnimate ? `style="animation-delay:${delay}ms"` : '';
        return `
          <div class="hand-card-wrap ${isActive ? 'hand-playable' : ''} ${animClass}"
               data-hand-index="${i}" data-instance-id="${c.instanceId}" ${animStyle}>
            ${renderCard(c, 'hand', { selectable: isActive })}
          </div>
        `;
      }).join('')}
      ${hand.length === 0 ? '<div class="hand-empty">手牌為空</div>' : ''}
    </div>
  `;
}

function renderOppHandCount(state, oppIdx) {
  const hand = state.players[oppIdx]?.zones?.[ZONE.HAND] || [];
  const count = hand.length;
  if (count === 0) return '<span class="opp-hand-label">對手手牌: 0</span>';
  return `
    <span class="opp-hand-label">對手手牌</span>
    <div class="opp-hand-cards">
      ${Array.from({length: count}, (_, i) =>
        `<div class="opp-hand-back" style="--i:${i}"></div>`
      ).join('')}
    </div>
  `;
}

function renderLog(state) {
  const recent = state.log.slice(-20);
  return `
    <div class="game-log">
      <div class="log-title">Log</div>
      <div class="log-entries">
        ${recent.map(e => `<div class="log-entry">${e.msg}</div>`).join('')}
      </div>
    </div>
  `;
}
