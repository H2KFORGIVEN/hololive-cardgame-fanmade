// EffectResolver: Pure function to resolve pendingEffect selections
// Used by both GameController (client) and ws-server (server)

import { getCard } from './CardDatabase.js';
import { createCardInstance } from './GameState.js';
import { sweepEffectKnockouts } from './GameEngine.js';

// Convert bloomStack entry (string | {cardId} | full instance) to a fresh card instance.
// The stack only records cardIds, not full state — any revert/archive path creates new instances.
function bloomStackEntryToInstance(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return createCardInstance(entry);
  if (entry.cardId && !entry.instanceId) return createCardInstance(entry.cardId);
  // Legacy object with instanceId — preserve the id but treat as a fresh instance shape
  if (entry.cardId) return createCardInstance(entry.cardId);
  return null;
}

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
        for (const entry of found.bloomStack) {
          const inst = bloomStackEntryToInstance(entry);
          if (inst) targetPlayer.zones['hand'].push(inst);
        }
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

    // Multi-select continuation: if maxSelect > 1, re-emit the same prompt
    // with the picked card removed and maxSelect decremented. Player can stop
    // early via the modal's skip button. This makes maxSelect>1 actually work
    // (previously it was set in handlers but UI only allowed 1 pick total).
    if (prompt.maxSelect && prompt.maxSelect > 1 && Array.isArray(prompt.cards)) {
      const newCards = prompt.cards.filter(c => c.instanceId !== selected.instanceId);
      if (newCards.length > 0) {
        const baseMsg = prompt.baseMessage || prompt.message || '';
        const remainingPicks = prompt.maxSelect - 1;
        state.pendingEffect = {
          ...prompt,
          cards: newCards,
          maxSelect: remainingPicks,
          message: `${baseMsg}（還可選 ${remainingPicks} 張，可跳過）`,
          baseMessage: baseMsg,
        };
        return state;
      }
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

  } else if (action === 'HAND_TO_ARCHIVE') {
    // Move selected hand card to archive (used by クロニー oshi: "save 1 hand card")
    const hand = player.zones['hand'];
    const idx = hand.findIndex(c => c.instanceId === selected.instanceId);
    if (idx >= 0) {
      const card = hand.splice(idx, 1)[0];
      player.zones['archive'].push(card);
      addLog(state, prompt.player, `將 ${selected.name || getCard(card.cardId)?.name || ''} 從手牌存檔`);
    }

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

  } else if (action === 'CHEER_FROM_ARCHIVE_TO_MEMBER') {
    // Player picked an own member to receive 1 cheer from the archive.
    // prompt.cheerColors (array of '白'/'綠'/...) optionally constrains
    // which color to pick — null/empty = any. Multi-pick uses the same
    // re-emit mechanism as SEARCH_SELECT below: maxSelect>1 → re-prompt
    // with the picked member removed and counter decremented.
    const target = getAllMembers(player).find(m => m.instanceId === selected.instanceId);
    const colors = Array.isArray(prompt.cheerColors) && prompt.cheerColors.length > 0 ? prompt.cheerColors : null;
    const archive = player.zones['archive'];
    let cheerIdx = -1;
    for (let i = 0; i < archive.length; i++) {
      const cd = getCard(archive[i].cardId);
      if (cd?.type !== '吶喊') continue;
      if (colors && !colors.includes(cd.color)) continue;
      cheerIdx = i; break;
    }
    if (target && cheerIdx >= 0) {
      const cheer = archive.splice(cheerIdx, 1)[0];
      cheer.faceDown = false;
      if (!target.attachedCheer) target.attachedCheer = [];
      target.attachedCheer.push(cheer);
      addLog(state, prompt.player, `存檔吶喊 → ${selected.name || getCard(target.cardId)?.name || ''}`);
    }
    // Multi-pick chain: re-emit the prompt with the picked member removed
    // and maxSelect decremented (same mechanism as SEARCH_SELECT above).
    if (prompt.maxSelect && prompt.maxSelect > 1 && Array.isArray(prompt.cards)) {
      const newCards = prompt.cards.filter(c => c.instanceId !== selected.instanceId);
      // Need archive to still have matching cheer to continue
      const stillHasCheer = archive.some(c => {
        const cd = getCard(c.cardId);
        if (cd?.type !== '吶喊') return false;
        if (colors && !colors.includes(cd.color)) return false;
        return true;
      });
      if (newCards.length > 0 && stillHasCheer) {
        const baseMsg = prompt.baseMessage || prompt.message || '';
        const remaining = prompt.maxSelect - 1;
        state.pendingEffect = {
          ...prompt,
          cards: newCards,
          maxSelect: remaining,
          message: `${baseMsg}（還可選 ${remaining} 位，可跳過）`,
          baseMessage: baseMsg,
        };
        return state;
      }
    }

  } else if (action === 'CHEER_FROM_DECK_TOP_TO_MEMBER') {
    // Player picked an own member to receive 1 cheer card from the TOP of
    // their cheer deck. Used by cards like hBP07-053 / hBP07-054 art1
    // (「將自己吶喊牌組上方的1張牌發送給...成員」). Distinct from
    // CHEER_FROM_ARCHIVE_TO_MEMBER which pulls from archive.
    const target = getAllMembers(player).find(m => m.instanceId === selected.instanceId);
    const cheerDeck = player.zones['cheerDeck'];
    if (target && cheerDeck && cheerDeck.length > 0) {
      const cheer = cheerDeck.shift();
      cheer.faceDown = false;
      if (!target.attachedCheer) target.attachedCheer = [];
      target.attachedCheer.push(cheer);
      addLog(state, prompt.player, `吶喊牌組頂 → ${selected.name || getCard(target.cardId)?.name || ''}`);
    } else if (!cheerDeck || cheerDeck.length === 0) {
      addLog(state, prompt.player, `吶喊牌組空 — 無法送吶喊`);
    }

  } else if (action === 'CHEER_DECK_REVEAL_MATCH_TO_MEMBER') {
    // Reveal cheer cards from cheer-deck top until one matches a target's
    // color (or filter); send that cheer to the picked member; reshuffle
    // the rest. Used by hBP01-094 「クロにちは！」 — match cheer color
    // to the picked member's color.
    const target = getAllMembers(player).find(m => m.instanceId === selected.instanceId);
    const targetColor = getCard(target?.cardId)?.color;
    const cheerDeck = player.zones['cheerDeck'];
    if (target && targetColor && cheerDeck && cheerDeck.length > 0) {
      let pickIdx = -1;
      for (let i = 0; i < cheerDeck.length; i++) {
        const cd = getCard(cheerDeck[i].cardId);
        if (cd?.color === targetColor) { pickIdx = i; break; }
      }
      if (pickIdx >= 0) {
        const cheer = cheerDeck.splice(pickIdx, 1)[0];
        cheer.faceDown = false;
        if (!target.attachedCheer) target.attachedCheer = [];
        target.attachedCheer.push(cheer);
        addLog(state, prompt.player, `${targetColor} 吶喊 → ${selected.name || getCard(target.cardId)?.name || ''}`);
      } else {
        addLog(state, prompt.player, `吶喊牌組無 ${targetColor} 色卡`);
      }
      // Reshuffle (real text says reshuffle after)
      shuffleArr(cheerDeck);
    }

  } else if (action === 'ATTACH_FROM_ARCHIVE_TO_MEMBER') {
    // Player picked which support card from archive to attach to the
    // member that triggered the effect (prompt.targetInstanceId).
    // Used by hBP07-052 「お時間ですわ！」 (pick mascot) and similar.
    const archive = player.zones['archive'];
    const archiveIdx = archive.findIndex(c => c.instanceId === selected.instanceId);
    const target = prompt.targetInstanceId
      ? getAllMembers(player).find(m => m.instanceId === prompt.targetInstanceId)
      : null;
    if (archiveIdx >= 0 && target) {
      const card = archive.splice(archiveIdx, 1)[0];
      card.faceDown = false;
      if (!target.attachedSupport) target.attachedSupport = [];
      target.attachedSupport.push(card);
      addLog(state, prompt.player, `存檔 ${selected.name || getCard(card.cardId)?.name || ''} → 附加給 ${getCard(target.cardId)?.name || '成員'}`);
    }

  } else if (action === 'OPP_MEMBER_DAMAGE') {
    // Player picked one of opponent's stage members to receive special damage.
    // amount carried on prompt.damageAmount. Triggers post-damage sweep so
    // a knock-out gets archived; per game rules, special damage doesn't cost
    // life on the opponent unless the prompt explicitly opts in via
    // prompt.causeLifeLoss === true (no current cards do).
    const opp = state.players[1 - prompt.player];
    const allOpp = getAllMembers(opp);
    const target = allOpp.find(m => m.instanceId === selected.instanceId);
    const amount = prompt.damageAmount || 0;
    if (target && amount > 0) {
      target.damage = (target.damage || 0) + amount;
      addLog(state, prompt.player, `${selected.name || getCard(target.cardId)?.name || ''} 受到 ${amount} 特殊傷害`);
      sweepEffectKnockouts(state);
    }

  } else if (action === 'LIFE_CHEER') {
    // Defender chooses which of their own members receives the revealed life cheer.
    // prompt.cheerInstances holds the already-flipped life cards waiting to attach.
    const cheerCards = prompt.cheerInstances || [];
    const target = getAllMembers(player).find(m => m.instanceId === selected.instanceId);
    if (target && cheerCards.length > 0) {
      if (!target.attachedCheer) target.attachedCheer = [];
      for (const c of cheerCards) {
        c.faceDown = false;
        target.attachedCheer.push(c);
      }
      addLog(state, prompt.player, `${cheerCards.length} 張生命吶喊附加到 ${selected.name || getCard(target.cardId)?.name || '成員'}`);
    }

  } else {
    addLog(state, prompt.player, `選擇了 ${selected.name}`);
  }

  // Advance to queued next prompt (if multiple effects fired back-to-back)
  state.pendingEffect = null;
  if (state.pendingEffectQueue && state.pendingEffectQueue.length > 0) {
    state.pendingEffect = state.pendingEffectQueue.shift();
  }
  return state;
}

function addLog(state, player, msg) {
  state.log.push({ turn: state.turnNumber, player, msg, ts: Date.now() });
}
