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

  } else if (action === 'BOOST_PICKED_MEMBER') {
    // Player picked an own member to receive a turn-scoped damage boost.
    // prompt.amount = boost size. prompt.bonusFor = optional { tag: ..., bonus: N }
    // for cards like 「+50; if #ID3期生 Buzz → +80」. Used by hBP07-002 oshi
    // (Phase 2.1.1), hBP07-053/055 effectB (pick #Promise +20/+50), etc.
    const target = getAllMembers(player).find(m => m.instanceId === selected.instanceId);
    const amount = prompt.amount || 0;
    if (!target || amount <= 0) {
      addLog(state, prompt.player, '無有效目標 — 跳過 boost');
    } else {
      const bonusFor = prompt.bonusFor;
      let total = amount;
      if (bonusFor && bonusFor.tag) {
        const tagStr = String(getCard(target.cardId)?.tag || '');
        const bloom = getCard(target.cardId)?.bloom || '';
        const tagMatch = tagStr.includes(bonusFor.tag);
        const bloomMatch = !bonusFor.requireBloom || bloom.includes(bonusFor.requireBloom);
        if (tagMatch && bloomMatch) total += bonusFor.bonus || 0;
      }
      // Push a turn-scoped boost keyed to this specific instance
      state._turnBoosts = state._turnBoosts || [];
      state._turnBoosts.push({
        type: 'DAMAGE_BOOST',
        amount: total,
        target: 'instance',
        instanceId: target.instanceId,
        duration: 'turn',
      });
      addLog(state, prompt.player, `${getCard(target.cardId)?.name || ''} 本回合藝能 +${total}`);
    }

  } else if (action === 'HEAL_PICKED_MEMBER') {
    // Player picked own member; heal them by prompt.amount HP. Used by
    // cards like 「自己1位成員HP回復N點」 — hSD06-007 (#秘密結社holoX) etc.
    const target = getAllMembers(player).find(m => m.instanceId === selected.instanceId);
    const amount = prompt.amount || 0;
    if (target && amount > 0) {
      target.damage = Math.max(0, (target.damage || 0) - amount);
      addLog(state, prompt.player, `${getCard(target.cardId)?.name || ''} HP 回復 ${amount}`);
    }

  } else if (action === 'CHEER_MOVE_TWO_STEP_PICK_SOURCE') {
    // First step of a two-step cheer-move: player picked which member to take
    // a cheer FROM. Engine queues the second prompt to pick the destination.
    // prompt.targetCandidates = list of candidate target member info objects.
    // prompt.cheerFilter = { color?: '...', anyExceptThis?: bool }
    const sourceMember = getAllMembers(player).find(m => m.instanceId === selected.instanceId);
    if (!sourceMember || !sourceMember.attachedCheer || sourceMember.attachedCheer.length === 0) {
      addLog(state, prompt.player, '所選來源成員無吶喊 — 取消');
    } else {
      // Filter target candidates: exclude source if requested
      const allTargets = (prompt.targetCandidates || []).filter(t => t.instanceId !== sourceMember.instanceId);
      if (allTargets.length === 0) {
        addLog(state, prompt.player, '無可用接收成員');
      } else {
        // Queue step 2 prompt: pick destination
        state.pendingEffect = {
          type: 'SELECT_OWN_MEMBER',
          player: prompt.player,
          message: prompt.message2 || '選擇接收吶喊的成員',
          cards: allTargets,
          maxSelect: 1,
          afterAction: 'CHEER_MOVE_TWO_STEP_PICK_TARGET',
          sourceInstanceId: sourceMember.instanceId,
          cheerFilter: prompt.cheerFilter || {},
        };
        return state; // don't clear pendingEffect — chain to step 2
      }
    }

  } else if (action === 'CHEER_MOVE_TWO_STEP_PICK_TARGET') {
    // Second step: player picked destination. Engine moves 1 cheer
    // from the prompt.sourceInstanceId member to selected.
    const allMembers = getAllMembers(player);
    const source = allMembers.find(m => m.instanceId === prompt.sourceInstanceId);
    const target = allMembers.find(m => m.instanceId === selected.instanceId);
    if (!source || !target || !source.attachedCheer?.length) {
      addLog(state, prompt.player, '吶喊移動失敗（來源/目標/吶喊缺失）');
    } else {
      // Pick a cheer matching filter
      const filter = prompt.cheerFilter || {};
      let cheerIdx = 0;
      if (filter.color) {
        cheerIdx = source.attachedCheer.findIndex(c => getCard(c.cardId)?.color === filter.color);
        if (cheerIdx < 0) cheerIdx = 0;
      }
      const cheer = source.attachedCheer.splice(cheerIdx, 1)[0];
      if (cheer) {
        if (!target.attachedCheer) target.attachedCheer = [];
        target.attachedCheer.push(cheer);
        addLog(state, prompt.player,
          `吶喊：${getCard(source.cardId)?.name || ''} → ${getCard(target.cardId)?.name || ''}`);
      }
    }

  } else if (action === 'ARCHIVE_HAND_THEN_DRAW_N') {
    // Player picked which hand cards to archive (multi-pick); engine then
    // draws N cards where N = number archived. Used by hBP04-066
    // 「『感情結晶体』」 (archive any → draw same count) and similar.
    // selected.instanceIds = array of hand-card instance IDs to archive.
    const ids = Array.isArray(selected.instanceIds) ? selected.instanceIds : [selected.instanceId];
    const hand = player.zones['hand'];
    let archived = 0;
    for (const id of ids) {
      const idx = hand.findIndex(c => c.instanceId === id);
      if (idx >= 0) {
        const card = hand.splice(idx, 1)[0];
        player.zones['archive'].push(card);
        archived++;
      }
    }
    if (archived > 0) {
      // Use draw-from-deck (top)
      for (let i = 0; i < archived && player.zones['deck'].length > 0; i++) {
        const c = player.zones['deck'].shift();
        c.faceDown = false;
        hand.push(c);
      }
      addLog(state, prompt.player, `存檔 ${archived} 張 → 抽 ${archived} 張`);
    }

  } else if (action === 'DICE_BRANCH_PROMPT') {
    // Player chose whether to roll a die (selected.roll === true/false).
    // If roll, engine rolls and applies prompt.branches[result].
    // For now, simple version: handler chooses based on roll outcome.
    // prompt.branches = { '1-2': { ... }, '3-4': { ... }, ... }
    if (selected.roll === false || selected.skip === true) {
      addLog(state, prompt.player, '玩家選擇不擲骰');
    } else {
      const r = Math.floor(Math.random() * 6) + 1;
      addLog(state, prompt.player, `擲骰：${r}`);
      // Branch resolution is deferred to handler — set state._lastDiceResult
      state._lastDiceResult = { player: prompt.player, value: r, ts: Date.now() };
      state._diceRollsThisTurn = state._diceRollsThisTurn || [0, 0];
      state._diceRollsThisTurn[prompt.player] = (state._diceRollsThisTurn[prompt.player] || 0) + 1;
    }

  } else if (action === 'RETURN_DEBUT_TO_DECK_BOTTOM') {
    // Player picked one of own backstage Debut members to return to deck bottom.
    // Used as a cost by cards like hSD12-013 (return Debut: draw 2).
    const idx = player.zones['backstage'].findIndex(m => m.instanceId === selected.instanceId);
    if (idx >= 0) {
      const card = player.zones['backstage'].splice(idx, 1)[0];
      card.faceDown = false;
      // Remove any attached cheer/support back to archive (per general rule)
      if (card.attachedCheer) {
        for (const c of card.attachedCheer) player.zones['archive'].push(c);
        card.attachedCheer = [];
      }
      if (card.attachedSupport) {
        for (const c of card.attachedSupport) player.zones['archive'].push(c);
        card.attachedSupport = [];
      }
      // Bloom stack back to archive
      if (card.bloomStack) {
        for (const entry of card.bloomStack) {
          const inst = bloomStackEntryToInstance(entry);
          if (inst) player.zones['archive'].push(inst);
        }
        card.bloomStack = [];
      }
      card.damage = 0;
      player.zones['deck'].push(card); // bottom
      addLog(state, prompt.player, `${selected.name || ''} 返回牌組底`);
      // Optional follow-up effect via prompt.thenDraw / prompt.thenLog
      if (prompt.thenDrawN && prompt.thenDrawN > 0) {
        for (let i = 0; i < prompt.thenDrawN && player.zones['deck'].length > 0; i++) {
          const c = player.zones['deck'].shift();
          c.faceDown = false;
          player.zones['hand'].push(c);
        }
        addLog(state, prompt.player, `抽 ${prompt.thenDrawN} 張`);
      }
    }

  } else if (action === 'RETURN_TO_HAND_FROM_BLOOM_STACK') {
    // Player picked a stage member with a bloom stack; pop the top stack entry
    // (or all per prompt.takeAll) back to hand. Used by 「將重疊的1張回手」 effects.
    const target = getAllMembers(player).find(m => m.instanceId === selected.instanceId);
    if (!target || !target.bloomStack || target.bloomStack.length === 0) {
      addLog(state, prompt.player, '所選成員無重疊 — 跳過');
    } else {
      const takeAll = prompt.takeAll === true;
      let popped = 0;
      while (target.bloomStack.length > 0 && (takeAll || popped < (prompt.takeN || 1))) {
        const entry = target.bloomStack.pop();
        const inst = bloomStackEntryToInstance(entry);
        if (inst) player.zones['hand'].push(inst);
        popped++;
      }
      addLog(state, prompt.player, `${getCard(target.cardId)?.name || ''} 重疊 ${popped} 張回手`);
    }

  } else if (action === 'ARCHIVE_OWN_CHEER_THEN_DMG') {
    // Cost-bearing optional effect (Phase 2.4 #1):
    //   cost: archive 1 cheer attached to one of own stage members
    //   effect: special damage to opp per prompt.damageTarget
    //
    // Prompt fields:
    //   cards: [{instanceId: cheerInstanceId, cardId, name, image}, ...]
    //   damageAmount: number
    //   damageTarget: 'opp_center' | 'opp_collab' | 'opp_center_or_collab' | 'opp_pick' | 'none'
    //   followupSearch: optional { ... } prompt to chain after archive (for cards
    //     where the post-cost effect is a search rather than damage; queued)
    const allMembers = getAllMembers(player);
    let foundMember = null;
    let cheerIdx = -1;
    for (const m of allMembers) {
      const idx = (m.attachedCheer || []).findIndex(c => c.instanceId === selected.instanceId);
      if (idx >= 0) { foundMember = m; cheerIdx = idx; break; }
    }
    if (!foundMember) {
      addLog(state, prompt.player, '找不到吶喊卡 — 跳過');
    } else {
      const cheer = foundMember.attachedCheer.splice(cheerIdx, 1)[0];
      cheer.faceDown = false;
      player.zones['archive'].push(cheer);
      const cheerName = getCard(cheer.cardId)?.name || '吶喊';
      addLog(state, prompt.player, `${getCard(foundMember.cardId)?.name || ''} 的 ${cheerName} → 存檔（成本）`);

      // Multi-cost re-emit: if the prompt declared maxSelect > 1, the player
      // still owes more cheer cards. Re-emit the same prompt with the picked
      // card removed, maxSelect decremented. Damage/followup deferred until
      // the FINAL pick (maxSelect === 1, no re-emit branch).
      if (prompt.maxSelect && prompt.maxSelect > 1 && Array.isArray(prompt.cards)) {
        const newCards = prompt.cards.filter(c => c.instanceId !== selected.instanceId);
        if (newCards.length > 0) {
          const remaining = prompt.maxSelect - 1;
          const baseMsg = prompt.baseMessage || prompt.message || '';
          state.pendingEffect = {
            ...prompt,
            cards: newCards,
            maxSelect: remaining,
            message: `${baseMsg}（還需選 ${remaining} 張）`,
            baseMessage: baseMsg,
          };
          return state;
        }
      }

      const opp = state.players[1 - prompt.player];
      const amount = prompt.damageAmount || 0;
      const tgt = prompt.damageTarget;

      if (tgt === 'opp_center' && opp.zones['center'] && amount > 0) {
        opp.zones['center'].damage = (opp.zones['center'].damage || 0) + amount;
        addLog(state, prompt.player, `對手中心 ${amount} 特殊傷害`);
        sweepEffectKnockouts(state);
      } else if (tgt === 'opp_collab' && opp.zones['collab'] && amount > 0) {
        opp.zones['collab'].damage = (opp.zones['collab'].damage || 0) + amount;
        addLog(state, prompt.player, `對手聯動 ${amount} 特殊傷害`);
        sweepEffectKnockouts(state);
      } else if (tgt === 'opp_center_or_collab' && amount > 0) {
        const center = opp.zones['center'];
        const collab = opp.zones['collab'];
        if (center && !collab) {
          center.damage = (center.damage || 0) + amount;
          addLog(state, prompt.player, `對手中心 ${amount} 特殊傷害`);
          sweepEffectKnockouts(state);
        } else if (!center && collab) {
          collab.damage = (collab.damage || 0) + amount;
          addLog(state, prompt.player, `對手聯動 ${amount} 特殊傷害`);
          sweepEffectKnockouts(state);
        } else if (center && collab) {
          // Queue picker
          const targets = [center, collab].map(m => ({
            instanceId: m.instanceId, cardId: m.cardId,
            name: getCard(m.cardId)?.name || '',
          }));
          state.pendingEffectQueue = state.pendingEffectQueue || [];
          state.pendingEffectQueue.push({
            type: 'SELECT_TARGET', player: prompt.player,
            message: `選擇對手中心或聯動（${amount} 特殊傷害）`,
            cards: targets, maxSelect: 1, afterAction: 'OPP_MEMBER_DAMAGE',
            damageAmount: amount,
          });
        } else {
          addLog(state, prompt.player, '對手前場無成員 — 無傷害');
        }
      } else if (tgt === 'opp_pick' && amount > 0) {
        const allOpp = getAllMembers(opp);
        if (allOpp.length === 0) {
          addLog(state, prompt.player, '對手無成員 — 無傷害');
        } else if (allOpp.length === 1) {
          allOpp[0].damage = (allOpp[0].damage || 0) + amount;
          addLog(state, prompt.player, `${getCard(allOpp[0].cardId)?.name || ''} ${amount} 特殊傷害`);
          sweepEffectKnockouts(state);
        } else {
          const targets = allOpp.map(m => ({
            instanceId: m.instanceId, cardId: m.cardId,
            name: getCard(m.cardId)?.name || '',
          }));
          state.pendingEffectQueue = state.pendingEffectQueue || [];
          state.pendingEffectQueue.push({
            type: 'SELECT_TARGET', player: prompt.player,
            message: `選擇對手成員（${amount} 特殊傷害）`,
            cards: targets, maxSelect: 1, afterAction: 'OPP_MEMBER_DAMAGE',
            damageAmount: amount,
          });
        }
      } else if (tgt === 'opp_center_AND_pick_backstage' && amount > 0) {
        // Multi-target: apply amount to opp center AND queue picker for 1 backstage.
        // Used by hSD03-006 art2, hBP02-041 art1, hBP05-043 art1, etc.
        const center = opp.zones['center'];
        if (center) {
          center.damage = (center.damage || 0) + amount;
          addLog(state, prompt.player, `對手中心 ${amount} 特殊傷害`);
          sweepEffectKnockouts(state);
        } else {
          addLog(state, prompt.player, '對手無中心 — 中心傷害跳過');
        }
        const back = (opp.zones['backstage'] || []);
        if (back.length === 0) {
          addLog(state, prompt.player, '對手後台無成員 — 後台傷害跳過');
        } else if (back.length === 1) {
          back[0].damage = (back[0].damage || 0) + amount;
          addLog(state, prompt.player, `${getCard(back[0].cardId)?.name || ''} ${amount} 特殊傷害`);
          sweepEffectKnockouts(state);
        } else {
          const targets = back.map(m => ({
            instanceId: m.instanceId, cardId: m.cardId,
            name: getCard(m.cardId)?.name || '',
          }));
          state.pendingEffectQueue = state.pendingEffectQueue || [];
          state.pendingEffectQueue.push({
            type: 'SELECT_TARGET', player: prompt.player,
            message: `選擇對手後台（${amount} 特殊傷害）`,
            cards: targets, maxSelect: 1, afterAction: 'OPP_MEMBER_DAMAGE',
            damageAmount: amount,
          });
        }
      }

      // Optional follow-up search prompt (used by cards where the benefit is
      // a deck search rather than damage — e.g. hBP06-078 "search same-name
      // Debut"). Caller pre-builds the followup prompt object.
      if (prompt.followupSearch) {
        state.pendingEffectQueue = state.pendingEffectQueue || [];
        state.pendingEffectQueue.push(prompt.followupSearch);
      }
    }

  } else if (action === 'ARCHIVE_HAND_THEN_BOOST') {
    // Phase 2.4 #7: hand-cost variant for turn-boost effects.
    //   cost: archive selected hand card (1 only — most boost cards single-cost)
    //   effect: turn boost based on prompt.boostTarget:
    //     'self_center': auto +N to own center
    //     'self_collab': auto +N to own collab
    //     'pick_member': queue SELECT_OWN_MEMBER picker, optional tagFilter
    //
    // Prompt fields:
    //   cards: hand cards
    //   boostAmount: number
    //   boostTarget: 'self_center' | 'self_collab' | 'pick_member'
    //   tagFilter: optional string (only for pick_member)
    const hand = player.zones['hand'];
    const idx = hand.findIndex(c => c.instanceId === selected.instanceId);
    if (idx < 0) {
      addLog(state, prompt.player, '找不到手牌 — 跳過');
    } else {
      const card = hand.splice(idx, 1)[0];
      player.zones['archive'].push(card);
      addLog(state, prompt.player, `${getCard(card.cardId)?.name || ''} 從手牌存檔（成本）`);

      const amount = prompt.boostAmount || 0;
      const tgt = prompt.boostTarget;

      if (tgt === 'self_center' || tgt === 'self_collab') {
        const zone = tgt === 'self_center' ? 'center' : 'collab';
        const member = player.zones[zone];
        if (!member) {
          addLog(state, prompt.player, `${zone === 'center' ? '中心' : '聯動'}無成員 — 加成跳過`);
        } else {
          state._turnBoosts = state._turnBoosts || [];
          state._turnBoosts.push({
            type: 'DAMAGE_BOOST', amount,
            target: 'instance', instanceId: member.instanceId,
            duration: 'turn',
          });
          addLog(state, prompt.player, `${getCard(member.cardId)?.name || ''} 本回合 +${amount}`);
        }
      } else if (tgt === 'pick_member') {
        const stage = getAllMembers(player);
        let candidates = stage;
        if (prompt.tagFilter) {
          candidates = stage.filter(m => {
            const tag = getCard(m.cardId)?.tag || '';
            const tagStr = typeof tag === 'string' ? tag : JSON.stringify(tag);
            return tagStr.includes(prompt.tagFilter);
          });
        }
        if (candidates.length === 0) {
          addLog(state, prompt.player, `舞台無${prompt.tagFilter ? ` ${prompt.tagFilter}` : ''}成員 — 加成跳過`);
        } else if (candidates.length === 1) {
          const t = candidates[0];
          state._turnBoosts = state._turnBoosts || [];
          state._turnBoosts.push({
            type: 'DAMAGE_BOOST', amount,
            target: 'instance', instanceId: t.instanceId, duration: 'turn',
          });
          addLog(state, prompt.player, `${getCard(t.cardId)?.name || ''} 本回合 +${amount}`);
        } else {
          state.pendingEffectQueue = state.pendingEffectQueue || [];
          state.pendingEffectQueue.push({
            type: 'SELECT_OWN_MEMBER', player: prompt.player,
            message: `選擇 1 位${prompt.tagFilter || ''}成員 +${amount}`,
            cards: candidates.map(m => ({
              instanceId: m.instanceId, cardId: m.cardId,
              name: getCard(m.cardId)?.name || '',
            })),
            maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER',
            amount,
          });
        }
      }
    }

  } else if (action === 'ARCHIVE_HAND_THEN_OPP_DMG') {
    // Phase 2.4 #6: hand-cost variant for special damage effects.
    //   cost: archive selected hand card(s) (supports maxSelect>1 re-emit)
    //   effect: special damage to opp per prompt.damageTarget
    //
    // Prompt fields:
    //   cards: [{instanceId, cardId, name, image}, ...] hand cards
    //   maxSelect: 1 | 2 | 3 (re-emit with damage scaling on each pick)
    //   damageAmount: number — damage PER hand archived (multiplied implicitly
    //                 by re-emit count; the final pick applies the latest amount
    //                 N times if perCardScaling=true OR just once otherwise)
    //   perCardScaling: bool — if true, applies damageAmount once per archived
    //                 card (用途: 「每將1張...存檔，給予 X 點傷害」)
    //   damageTarget: 'opp_center' | 'opp_center_or_collab' | 'opp_pick'
    const hand = player.zones['hand'];
    const idx = hand.findIndex(c => c.instanceId === selected.instanceId);
    if (idx < 0) {
      addLog(state, prompt.player, '找不到手牌 — 跳過');
    } else {
      const card = hand.splice(idx, 1)[0];
      player.zones['archive'].push(card);
      addLog(state, prompt.player, `${getCard(card.cardId)?.name || ''} 從手牌存檔（成本）`);

      // Track running archived count via prompt._costPaid (mutated on re-emit)
      const costPaid = (prompt._costPaid || 0) + 1;

      // Per-card scaling: apply damage immediately for each archived card
      if (prompt.perCardScaling) {
        const opp = state.players[1 - prompt.player];
        const amount = prompt.damageAmount || 0;
        const target = prompt.damageTarget;
        if (amount > 0) {
          if (target === 'opp_center' && opp.zones['center']) {
            opp.zones['center'].damage = (opp.zones['center'].damage || 0) + amount;
            addLog(state, prompt.player, `對手中心 ${amount} 特殊傷害`);
            sweepEffectKnockouts(state);
          }
        }
      }

      // Multi-cost re-emit: if maxSelect > 1, re-emit with picked card removed.
      if (prompt.maxSelect && prompt.maxSelect > 1 && Array.isArray(prompt.cards)) {
        const newCards = prompt.cards.filter(c => c.instanceId !== selected.instanceId);
        if (newCards.length > 0) {
          const remaining = prompt.maxSelect - 1;
          const baseMsg = prompt.baseMessage || prompt.message || '';
          state.pendingEffect = {
            ...prompt,
            cards: newCards,
            maxSelect: remaining,
            _costPaid: costPaid,
            message: `${baseMsg}（還可選 ${remaining} 張，可跳過）`,
            baseMessage: baseMsg,
          };
          return state;
        }
      }

      // Final pick — apply damage if not per-card-scaling
      if (!prompt.perCardScaling) {
        const opp = state.players[1 - prompt.player];
        const amount = prompt.damageAmount || 0;
        const tgt = prompt.damageTarget;
        if (amount > 0) {
          if (tgt === 'opp_center' && opp.zones['center']) {
            opp.zones['center'].damage = (opp.zones['center'].damage || 0) + amount;
            addLog(state, prompt.player, `對手中心 ${amount} 特殊傷害`);
            sweepEffectKnockouts(state);
          } else if (tgt === 'opp_center_or_collab') {
            const center = opp.zones['center'];
            const collab = opp.zones['collab'];
            if (center && !collab) {
              center.damage = (center.damage || 0) + amount;
              addLog(state, prompt.player, `對手中心 ${amount} 特殊傷害`);
              sweepEffectKnockouts(state);
            } else if (!center && collab) {
              collab.damage = (collab.damage || 0) + amount;
              addLog(state, prompt.player, `對手聯動 ${amount} 特殊傷害`);
              sweepEffectKnockouts(state);
            } else if (center && collab) {
              const targets = [center, collab].map(m => ({
                instanceId: m.instanceId, cardId: m.cardId,
                name: getCard(m.cardId)?.name || '',
              }));
              state.pendingEffectQueue = state.pendingEffectQueue || [];
              state.pendingEffectQueue.push({
                type: 'SELECT_TARGET', player: prompt.player,
                message: `選擇對手中心或聯動（${amount} 特殊傷害）`,
                cards: targets, maxSelect: 1, afterAction: 'OPP_MEMBER_DAMAGE',
                damageAmount: amount,
              });
            } else {
              addLog(state, prompt.player, '對手前場無成員 — 無傷害');
            }
          } else if (tgt === 'opp_pick') {
            const allOpp = getAllMembers(opp);
            if (allOpp.length === 0) {
              addLog(state, prompt.player, '對手無成員 — 無傷害');
            } else if (allOpp.length === 1) {
              allOpp[0].damage = (allOpp[0].damage || 0) + amount;
              addLog(state, prompt.player, `${getCard(allOpp[0].cardId)?.name || ''} ${amount} 特殊傷害`);
              sweepEffectKnockouts(state);
            } else {
              const targets = allOpp.map(m => ({
                instanceId: m.instanceId, cardId: m.cardId,
                name: getCard(m.cardId)?.name || '',
              }));
              state.pendingEffectQueue = state.pendingEffectQueue || [];
              state.pendingEffectQueue.push({
                type: 'SELECT_TARGET', player: prompt.player,
                message: `選擇對手成員（${amount} 特殊傷害）`,
                cards: targets, maxSelect: 1, afterAction: 'OPP_MEMBER_DAMAGE',
                damageAmount: amount,
              });
            }
          }
        }
      }
    }

  } else if (action === 'SCRY_PLACE_DECK') {
    // Phase 2.4 #5: scry-1 with top/bottom choice.
    // Prompt fields:
    //   scryCardInstanceId: instanceId of the card already revealed at top of deck
    //   selected.instanceId === -1 → keep on top
    //   selected.instanceId === -2 → move to bottom
    const deck = player.zones['deck'];
    const idx = deck.findIndex(c => c.instanceId === prompt.scryCardInstanceId);
    if (idx < 0) {
      addLog(state, prompt.player, 'SCRY: 找不到展示的卡 — 跳過');
    } else {
      const card = deck.splice(idx, 1)[0];
      const choice = selected?.instanceId === -2 ? 'bottom' : 'top';
      if (choice === 'bottom') {
        deck.push(card);
        addLog(state, prompt.player, `${getCard(card.cardId)?.name || ''} 放回牌組底部`);
      } else {
        deck.unshift(card);
        addLog(state, prompt.player, `${getCard(card.cardId)?.name || ''} 放回牌組頂部`);
      }
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
