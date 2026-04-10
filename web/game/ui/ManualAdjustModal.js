import { getCard, getCardImage } from '../core/CardDatabase.js';
import { ZONE, MEMBER_STATE } from '../core/constants.js';
import { getStageMembers } from '../effects/handlers/common.js';

export function showManualAdjustModal(state, playerIdx, onAction) {
  const player = state.players[playerIdx];
  const members = [];

  // Collect all stage members with their zone info
  if (player.zones[ZONE.CENTER]) {
    members.push({ inst: player.zones[ZONE.CENTER], zone: 'Center', zoneKey: ZONE.CENTER });
  }
  if (player.zones[ZONE.COLLAB]) {
    members.push({ inst: player.zones[ZONE.COLLAB], zone: 'Collab', zoneKey: ZONE.COLLAB });
  }
  player.zones[ZONE.BACKSTAGE].forEach((m, i) => {
    members.push({ inst: m, zone: `Back ${i + 1}`, zoneKey: ZONE.BACKSTAGE, index: i });
  });

  // Also collect opponent members for damage
  const opIdx = 1 - playerIdx;
  const opponent = state.players[opIdx];
  const oppMembers = [];
  if (opponent.zones[ZONE.CENTER]) oppMembers.push({ inst: opponent.zones[ZONE.CENTER], zone: 'Center' });
  if (opponent.zones[ZONE.COLLAB]) oppMembers.push({ inst: opponent.zones[ZONE.COLLAB], zone: 'Collab' });
  opponent.zones[ZONE.BACKSTAGE].forEach((m, i) => {
    oppMembers.push({ inst: m, zone: `Back ${i + 1}` });
  });

  const overlay = document.createElement('div');
  overlay.className = 'manual-modal-overlay';
  overlay.innerHTML = `
    <div class="manual-modal">
      <div class="manual-modal-header">
        <h3>手動調整 - P${playerIdx + 1}</h3>
        <button class="manual-close" id="manualClose">&times;</button>
      </div>
      <div class="manual-modal-body">

        <div class="manual-section">
          <h4>己方成員</h4>
          ${members.map(m => {
            const card = getCard(m.inst.cardId);
            return `<div class="manual-member-row">
              <img src="${getCardImage(m.inst.cardId)}" class="manual-card-thumb">
              <div class="manual-member-info">
                <strong>${card?.name || ''}</strong>
                <span>${m.zone} | HP: ${m.inst.damage}/${card?.hp || '?'} | ${m.inst.state} | Cheer: ${m.inst.attachedCheer.length}</span>
              </div>
              <div class="manual-member-actions">
                <button class="manual-btn" data-action="ADD_DAMAGE" data-id="${m.inst.instanceId}" data-player="${playerIdx}">傷害+10</button>
                <button class="manual-btn" data-action="REMOVE_DAMAGE" data-id="${m.inst.instanceId}" data-player="${playerIdx}">回復10</button>
                <button class="manual-btn" data-action="TOGGLE_STATE" data-id="${m.inst.instanceId}" data-player="${playerIdx}">切換狀態</button>
              </div>
            </div>`;
          }).join('') || '<p>舞台無成員</p>'}
        </div>

        <div class="manual-section">
          <h4>對手成員</h4>
          ${oppMembers.map(m => {
            const card = getCard(m.inst.cardId);
            return `<div class="manual-member-row">
              <img src="${getCardImage(m.inst.cardId)}" class="manual-card-thumb">
              <div class="manual-member-info">
                <strong>${card?.name || ''}</strong>
                <span>${m.zone} | HP: ${m.inst.damage}/${card?.hp || '?'}</span>
              </div>
              <div class="manual-member-actions">
                <button class="manual-btn" data-action="ADD_DAMAGE" data-id="${m.inst.instanceId}" data-player="${opIdx}">傷害+10</button>
                <button class="manual-btn" data-action="REMOVE_DAMAGE" data-id="${m.inst.instanceId}" data-player="${opIdx}">回復10</button>
              </div>
            </div>`;
          }).join('') || '<p>對手舞台無成員</p>'}
        </div>

        <div class="manual-section">
          <h4>其他操作</h4>
          <div class="manual-other-actions">
            <button class="manual-btn manual-btn-wide" data-action="DRAW_CARD" data-player="${playerIdx}">己方抽 1 張牌</button>
            <button class="manual-btn manual-btn-wide" data-action="DRAW_CARD" data-player="${opIdx}">對手抽 1 張牌</button>
          </div>
        </div>

      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close
  const close = () => { overlay.remove(); };
  overlay.querySelector('#manualClose').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // Action buttons
  overlay.querySelectorAll('.manual-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const actionType = btn.dataset.action;
      const instanceId = parseInt(btn.dataset.id);
      const targetPlayer = parseInt(btn.dataset.player);

      const adjustment = { type: actionType };
      if (instanceId) adjustment.instanceId = instanceId;
      if (actionType === 'ADD_DAMAGE') adjustment.amount = 10;
      if (actionType === 'REMOVE_DAMAGE') adjustment.amount = 10;

      onAction({
        type: 'MANUAL_ADJUST',
        player: targetPlayer,
        adjustment,
      });

      // Refresh modal with new state
      close();
    });
  });
}

export function showEffectPromptModal(prompt, onDismiss) {
  const overlay = document.createElement('div');
  overlay.className = 'manual-modal-overlay';

  const card = getCard(prompt.cardId);
  const img = getCardImage(prompt.cardId);

  overlay.innerHTML = `
    <div class="manual-modal effect-prompt-modal">
      <div class="manual-modal-header">
        <h3>卡片效果</h3>
        <button class="manual-close" id="effectClose">&times;</button>
      </div>
      <div class="manual-modal-body">
        <div class="effect-prompt-card">
          ${img ? `<img src="${img}" class="effect-prompt-img">` : ''}
          <div class="effect-prompt-info">
            <strong>${prompt.cardName || card?.name || ''}</strong>
            <p class="effect-prompt-text">${prompt.text || ''}</p>
          </div>
        </div>
        <p class="effect-prompt-hint">此效果需要手動操作。請使用「手動調整」面板來執行效果，或直接關閉此視窗。</p>
        <button class="action-btn action-primary effect-dismiss-btn" id="effectDismiss">確認</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => { overlay.remove(); onDismiss?.(); };
  overlay.querySelector('#effectClose').addEventListener('click', close);
  overlay.querySelector('#effectDismiss').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}
