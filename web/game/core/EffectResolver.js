// EffectResolver: Pure function to resolve pendingEffect selections
// Used by both GameController (client) and ws-server (server)

import { getCard } from './CardDatabase.js';

function shuffleArr(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function getAllMembers(player) {
  return [player.zones['center'], player.zones['collab'], ...(player.zones['backstage'] || [])].filter(Boolean);
}

/**
 * Resolve a pendingEffect selection.
 * @param {Object} state - Full game state (will be mutated)
 * @param {Object} prompt - The pendingEffect prompt object
 * @param {Object} selected - The selected card/member { instanceId, name, cardId, targetDebutId? }
 * @returns {Object} state - The mutated state
 */
export function resolveEffectChoice(state, prompt, selected) {
  const player = state.players[prompt.player];
  const action = prompt.afterAction || prompt.type;

  if (action === 'PLACE_AND_SHUFFLE' || action === 'SEARCH_SELECT_PLACE') {
    const deck = player.zones['deck'];
    const idx = deck.findIndex(c => c.instanceId === selected.instanceId);
    if (idx >= 0) {
      const card = deck.splice(idx, 1)[0];
      card.faceDown = false;
      card.placedThisTurn = true;
      player.zones['backstage'].push(card);
      addLog(state, prompt.player, `展示並放置 ${selected.name} 到舞台`);
    }
    shuffleArr(player.zones['deck']);

  } else if (action === 'ATTACH_SUPPORT') {
    const deck = player.zones['deck'];
    const idx = deck.findIndex(c => c.instanceId === selected.instanceId);
    if (idx >= 0) {
      const card = deck.splice(idx, 1)[0];
      card.faceDown = false;
      const allMembers = getAllMembers(player);
      const target = prompt.targetInstanceId
        ? allMembers.find(m => m.instanceId === prompt.targetInstanceId)
        : allMembers[0];
      if (target) {
        if (!target.attachedSupport) target.attachedSupport = [];
        target.attachedSupport.push(card);
      }
      addLog(state, prompt.player, `展示 ${selected.name} 附加給成員`);
    }
    shuffleArr(player.zones['deck']);

  } else if (action === 'SEND_TO_ARCHIVE') {
    const deck = player.zones['deck'];
    const idx = deck.findIndex(c => c.instanceId === selected.instanceId);
    if (idx >= 0) {
      const card = deck.splice(idx, 1)[0];
      card.faceDown = false;
      player.zones['archive'].push(card);
      addLog(state, prompt.player, `展示 ${selected.name} 進入存檔`);
    }
    shuffleArr(player.zones['deck']);

  } else if (action === 'SUPPORT_MOVE') {
    const allMembers = getAllMembers(player);
    const source = allMembers.find(m => m.instanceId === prompt.sourceInstanceId);
    const target = allMembers.find(m => m.instanceId === selected.instanceId);
    if (source && target && source.attachedSupport) {
      const idx = prompt.supportIndex != null ? prompt.supportIndex : 0;
      if (idx >= 0 && idx < source.attachedSupport.length) {
        const support = source.attachedSupport.splice(idx, 1)[0];
        if (!target.attachedSupport) target.attachedSupport = [];
        target.attachedSupport.push(support);
        const name = getCard(support.cardId)?.name || '';
        addLog(state, prompt.player, `${name} 替換給 ${selected.name}`);
      }
    }

  } else if (action === 'CHEER_MOVE') {
    const allMembers = getAllMembers(player);
    const source = allMembers.find(m => m.instanceId === prompt.sourceInstanceId);
    const target = allMembers.find(m => m.instanceId === selected.instanceId);
    if (source && target && source.attachedCheer && source.attachedCheer.length > 0) {
      const cheerPred = prompt.cheerPredicate;
      let cheerIdx = 0;
      if (cheerPred && cheerPred !== 'any') {
        cheerIdx = source.attachedCheer.findIndex(c => {
          const d = getCard(c.cardId);
          return d && d.color === cheerPred;
        });
      }
      if (cheerIdx < 0) cheerIdx = 0;
      const cheer = source.attachedCheer.splice(cheerIdx, 1)[0];
      if (cheer) target.attachedCheer.push(cheer);
      addLog(state, prompt.player, `吶喊卡替換給 ${selected.name}`);
    }

  } else if (action === 'REVERT_TO_DEBUT') {
    const targetPlayer = state.players[prompt.targetPlayer != null ? prompt.targetPlayer : prompt.player];
    const zones = ['center', 'collab', 'backstage'];
    let found = null;
    for (const z of zones) {
      if (z === 'backstage') {
        const idx = targetPlayer.zones[z].findIndex(m => m.instanceId === selected.instanceId);
        if (idx >= 0) { found = targetPlayer.zones[z][idx]; break; }
      } else {
        if (targetPlayer.zones[z]?.instanceId === selected.instanceId) { found = targetPlayer.zones[z]; break; }
      }
    }
    if (found) {
      if (found.bloomStack) {
        for (const card of found.bloomStack) targetPlayer.zones['hand'].push(card);
        found.bloomStack = [];
      }
      if (found.attachedSupport) {
        for (const card of found.attachedSupport) targetPlayer.zones['hand'].push(card);
        found.attachedSupport = [];
      }
      found.damage = 0;
      addLog(state, prompt.player, `${selected.name} 返回 Debut 狀態`);
    }

  } else if (action === 'SELECT_FROM_ARCHIVE' || action === 'RETURN_FROM_ARCHIVE') {
    const archive = player.zones['archive'];
    const idx = archive.findIndex(c => c.instanceId === selected.instanceId);
    if (idx >= 0) {
      const card = archive.splice(idx, 1)[0];
      card.faceDown = false;
      player.zones['hand'].push(card);
      addLog(state, prompt.player, `從存檔選擇 ${selected.name} 回手牌`);
    }

  } else if (action === 'BLOOM_FROM_ARCHIVE') {
    const archive = player.zones['archive'];
    const idx = archive.findIndex(c => c.instanceId === selected.instanceId);
    if (idx >= 0) {
      const bloomCard = archive.splice(idx, 1)[0];
      bloomCard.faceDown = false;
      const targetId = selected.targetDebutId;
      const allMembers = getAllMembers(player);
      const target = targetId ? allMembers.find(m => m.instanceId === targetId) : null;
      if (target) {
        if (!target.bloomStack) target.bloomStack = [];
        target.bloomStack.push({ cardId: target.cardId, instanceId: target.instanceId });
        bloomCard.damage = target.damage;
        bloomCard.attachedCheer = target.attachedCheer || [];
        bloomCard.attachedSupport = target.attachedSupport || [];
        bloomCard.bloomStack = target.bloomStack;
        bloomCard.state = target.state;
        bloomCard.bloomedThisTurn = true;
        for (const z of ['center', 'collab']) {
          if (player.zones[z]?.instanceId === target.instanceId) { player.zones[z] = bloomCard; break; }
        }
        const bIdx = player.zones['backstage'].findIndex(m => m.instanceId === target.instanceId);
        if (bIdx >= 0) player.zones['backstage'][bIdx] = bloomCard;
        addLog(state, prompt.player, `限界化！${selected.name} 從存檔綻放`);
      }
    }

  } else if (action === 'SEARCH_SELECT' || action === 'ADD_TO_HAND') {
    const deck = player.zones['deck'];
    const idx = deck.findIndex(c => c.instanceId === selected.instanceId);
    if (idx >= 0) {
      const card = deck.splice(idx, 1)[0];
      card.faceDown = false;
      player.zones['hand'].push(card);
      addLog(state, prompt.player, `展示 ${selected.name} 加入手牌`);
    }
    // Chain: if remaining cards need to be ordered to bottom
    if (prompt.remainingCards) {
      const remaining = prompt.remainingCards.filter(c => c.instanceId !== selected.instanceId);
      if (remaining.length > 0) {
        state.pendingEffect = {
          type: 'ORDER_TO_BOTTOM',
          player: prompt.player,
          message: '選擇放回牌組下方的順序（先點=最底）',
          cards: remaining,
        };
        return state; // don't clear pendingEffect
      }
    }
    if (!prompt.noShuffle) shuffleArr(player.zones['deck']);

  } else if (action === 'ORDER_TO_BOTTOM') {
    // selected is { orderedIds: [...] }
    const ids = selected.orderedIds || [];
    for (const id of ids) {
      const idx = player.zones['deck'].findIndex(c => c.instanceId === id);
      if (idx >= 0) {
        const card = player.zones['deck'].splice(idx, 1)[0];
        player.zones['deck'].push(card);
      }
    }
    addLog(state, prompt.player, `${ids.length} 張牌放回牌組下方`);

  } else {
    addLog(state, prompt.player, `選擇了 ${selected.name}`);
  }

  state.pendingEffect = null;
  return state;
}

function addLog(state, player, msg) {
  state.log.push({ turn: state.turnNumber, player, msg, ts: Date.now() });
}
