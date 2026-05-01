import { PHASE, ZONE, ACTION, BLOOM_ORDER, MAX_STAGE_MEMBERS, MEMBER_STATE, parseCost, isSupport, isMember } from './constants.js';
import { isBloomLevelOverridden } from './BloomRuleOverrides.js';
import { getCard, getCardsByName } from './CardDatabase.js';
import { getStageCount, findInstance } from './GameState.js';
import { getColorlessReduction, getBatonColorlessReduction } from './AttachedSupportEffects.js';

export function validateAction(state, action) {
  const p = state.activePlayer;
  const player = state.players[p];
  const phase = state.phase;

  // Game-over gate — after a winner is decided, reject further action-
  // driving input so post-game client spam can't keep pumping the engine.
  if (state.winner !== null && state.winner !== undefined) {
    return fail('遊戲已結束');
  }

  // Pending-effect gate — while the engine is waiting for an EFFECT_RESPONSE
  // (LIFE_CHEER, SEARCH_SELECT, etc.), reject any action that would mutate
  // state from underneath the pending prompt. Online cheese: a client could
  // otherwise skip past opponent's life-cheer assignment by sending
  // END_PERFORMANCE and have the pending prompt silently leaked.
  if (state.pendingEffect) {
    // CHEER_ASSIGN is how LIFE_CHEER is resolved — allowed.
    // MANUAL_ADJUST is a debug / local tool — allowed to let the user
    // unstick a broken state locally.
    const allowedWhilePending = new Set([ACTION.CHEER_ASSIGN, ACTION.MANUAL_ADJUST]);
    if (!allowedWhilePending.has(action.type)) {
      return fail(`有未解決效果（${state.pendingEffect.type}），請先處理`);
    }
  }

  switch (action.type) {
    case ACTION.CHEER_ASSIGN:
      return validateCheerAssign(state, action, player);
    case ACTION.PLACE_MEMBER:
      return validatePlaceMember(state, action, player);
    case ACTION.BLOOM:
      return validateBloom(state, action, player);
    case ACTION.PLAY_SUPPORT:
      return validatePlaySupport(state, action, player);
    case ACTION.USE_OSHI_SKILL:
      return validateOshiSkill(state, action, player);
    case ACTION.COLLAB:
      return validateCollab(state, action, player);
    case ACTION.BATON_PASS:
      return validateBatonPass(state, action, player);
    case ACTION.USE_ART:
      return validateUseArt(state, action, player, p);
    case ACTION.END_MAIN_PHASE:
      return phase === PHASE.MAIN ? ok() : fail('不在主要階段');
    case ACTION.END_PERFORMANCE:
      return phase === PHASE.PERFORMANCE ? ok() : fail('不在表演階段');
    case ACTION.ADVANCE_PHASE:
      return ok();
    case ACTION.MANUAL_ADJUST:
      return ok();
    default:
      return ok();
  }
}

function ok() { return { valid: true }; }
function fail(reason) { return { valid: false, reason }; }

function validateCheerAssign(state, action, player) {
  if (state.phase !== PHASE.CHEER) return fail('不在應援階段');
  const target = findInstance(player, action.targetInstanceId);
  if (!target) return fail('找不到目標成員');
  const z = target.zone;
  if (z !== ZONE.CENTER && z !== ZONE.COLLAB && z !== ZONE.BACKSTAGE) {
    return fail('只能發送給舞台上的成員');
  }
  return ok();
}

function validatePlaceMember(state, action, player) {
  if (state.phase !== PHASE.MAIN) return fail('不在主要階段');
  const handCard = player.zones[ZONE.HAND][action.handIndex];
  if (!handCard) return fail('手牌位置無效');
  const card = getCard(handCard.cardId);
  if (!card || !isMember(card.type)) return fail('不是成員卡');
  if (card.bloom !== 'Debut' && card.bloom !== 'Spot') {
    return fail('只能放置 Debut 或 Spot 成員（1st/2nd 需透過綻放）');
  }
  if (getStageCount(player) >= MAX_STAGE_MEMBERS) {
    return fail(`舞台已滿（最多 ${MAX_STAGE_MEMBERS} 位成員）`);
  }
  return ok();
}

// Phase 2.3.2 — Cross-bloom permission (DEFERRED).
// hBP07-056 effectG「時界を統べし者」 lets a 2nd オーロ・クロニー member's
// bloom-stack be reused by ANOTHER オーロ・クロニー member to bloom. This
// requires either:
//   (a) a new action type CROSS_BLOOM with sourceMemberInstanceId param, or
//   (b) extending BLOOM action with an `useStackFrom` field
// Both touch processBloom + validation + UI. Marked as TODO — handler at
// phaseB-cards.js:1635 currently logs a hint via Manual Adjust panel.

function validateBloom(state, action, player) {
  if (state.phase !== PHASE.MAIN) return fail('不在主要階段');

  // Phase 2.3.1 — first-turn bloom permission rule mod
  // Default: first-turn bloom forbidden. Cards like hBP07-050 「この日が来た！」
  // grant first-turn-back-attack bloom permission for specific center
  // characters. The handler sets state._firstTurnBloomAvailable[player]
  // when the condition is met.
  if (state.firstTurn[state.activePlayer]) {
    const permission = state._firstTurnBloomAvailable && state._firstTurnBloomAvailable[state.activePlayer];
    const isBackAttacker = state.activePlayer !== state.firstPlayer;
    if (!permission || !isBackAttacker) return fail('第一回合不能綻放');
    // Permission is conditional on center being a specific character — handler
    // already verified that when it set the flag. Allow this bloom but check
    // that the bloom card is a 1st (not 2nd / Buzz) since the permission text
    // says 「使用自己手牌的1st成員進行綻放」.
    const handCardCheck = player.zones[ZONE.HAND][action.handIndex];
    const bloomCardCheck = handCardCheck && getCard(handCardCheck.cardId);
    if (bloomCardCheck && bloomCardCheck.bloom !== '1st' && bloomCardCheck.bloom !== '1st Buzz') {
      return fail('第一回合特殊綻放只能使用 1st 成員');
    }
  }

  const handCard = player.zones[ZONE.HAND][action.handIndex];
  if (!handCard) return fail('手牌位置無效');
  const bloomCard = getCard(handCard.cardId);
  if (!bloomCard || !isMember(bloomCard.type)) return fail('不是成員卡');

  const target = findInstance(player, action.targetInstanceId);
  if (!target) return fail('找不到目標成員');
  const targetCard = getCard(target.card.cardId);
  if (!targetCard) return fail('目標卡片資料錯誤');

  // Must be same character name
  if (bloomCard.name !== targetCard.name) return fail('綻放必須是同名角色');

  // Check bloom level progression. "1st" and "1st Buzz" both represent
  // level 1 — Buzz is a Buzz-tag subtype of 1st, not a separate tier.
  // Use a numeric level mapping so that 1st → 2nd (or 1st Buzz → 2nd)
  // is +1, not +2.
  const bloomLevelOf = (b) => {
    if (b === 'Debut') return 0;
    if (b === '1st' || b === '1st Buzz') return 1;
    if (b === '2nd') return 2;
    return -1;
  };
  const currentLevel = targetCard.bloom;
  const newLevel = bloomCard.bloom;
  const currentLv = bloomLevelOf(currentLevel);
  const newLv = bloomLevelOf(newLevel);

  if (currentLv === -1 || newLv === -1) return fail('無效的綻放等級');
  if (newLv < currentLv) return fail('綻放等級不能下降');
  if (newLv === currentLv && currentLevel === newLevel) return fail('綻放等級不能下降');
  // Standard rule: bloom must be exactly one level above current. Special
  // cards (e.g. hBP01-045 AZKi: life ≤ 3 → may bloom Debut → 2nd) opt in
  // via BloomRuleOverrides registry; for everyone else, enforce strict +1.
  if (newLv > currentLv + 1 && !isBloomLevelOverridden(bloomCard, target.card, player)) {
    return fail('綻放只能升 1 個等級（特殊規則例外）');
  }

  // Cannot bloom if placed this turn
  if (target.card.placedThisTurn && !target.card.canBloomThisTurn) return fail('本回合放置的成員不能綻放');
  // Cannot bloom if already bloomed this turn
  if (target.card.bloomedThisTurn) return fail('本回合已綻放過的成員不能再綻放');

  // Damage must not exceed new HP
  if (bloomCard.hp && target.card.damage > bloomCard.hp) {
    return fail('傷害超過綻放後的 HP');
  }

  return ok();
}

function validatePlaySupport(state, action, player) {
  if (state.phase !== PHASE.MAIN) return fail('不在主要階段');

  const handCard = player.zones[ZONE.HAND][action.handIndex];
  if (!handCard) return fail('手牌位置無效');
  const card = getCard(handCard.cardId);
  if (!card || !isSupport(card.type)) return fail('不是支援卡');

  // LIMITED check
  const effectText = typeof card.supportEffect === 'object'
    ? (card.supportEffect['zh-TW'] || card.supportEffect['ja'] || '')
    : (card.supportEffect || '');
  const isLimited = effectText.includes('LIMITED');

  // First player's first turn: cannot use LIMITED supports
  // (Second player CAN use LIMITED on their first turn)
  if (isLimited && state.firstTurn[state.activePlayer] && state.activePlayer === state.firstPlayer) {
    return fail('先攻玩家第一回合不能使用 LIMITED 支援卡');
  }

  if (isLimited && player.usedLimited) {
    return fail('本回合已使用過 LIMITED 支援卡');
  }

  return ok();
}

function validateOshiSkill(state, action, player) {
  if (state.phase !== PHASE.MAIN) return fail('不在主要階段');
  if (!player.oshi) return fail('沒有推しホロメン');

  const oshiCard = getCard(player.oshi.cardId);
  if (!oshiCard) return fail('推し資料錯誤');

  const skillType = action.skillType; // 'oshi' or 'sp'
  if (skillType === 'sp') {
    if (player.oshi.usedSp) return fail('SP 技能每場只能使用一次');
    const cost = Math.abs(oshiCard.spSkill?.holoPower || 0);
    if (player.zones[ZONE.HOLO_POWER].length < cost) {
      return fail(`holo 能量不足（需要 ${cost}，目前 ${player.zones[ZONE.HOLO_POWER].length}）`);
    }
  } else {
    if (player.oshiSkillUsedThisTurn) return fail('推し技能每回合只能使用一次');
    const cost = Math.abs(oshiCard.oshiSkill?.holoPower || 0);
    if (player.zones[ZONE.HOLO_POWER].length < cost) {
      return fail(`holo 能量不足（需要 ${cost}，目前 ${player.zones[ZONE.HOLO_POWER].length}）`);
    }
  }

  return ok();
}

function validateCollab(state, action, player) {
  if (state.phase !== PHASE.MAIN) return fail('不在主要階段');
  if (player.usedCollab) return fail('本回合已進行過聯動');
  if (player.zones[ZONE.COLLAB]) return fail('聯動位置已有成員');
  if (player.zones[ZONE.DECK].length === 0) return fail('牌組為空，無法聯動');

  const backstage = player.zones[ZONE.BACKSTAGE];
  const idx = action.backstageIndex;
  if (idx < 0 || idx >= backstage.length) return fail('後台位置無效');
  if (backstage[idx].state !== MEMBER_STATE.ACTIVE) return fail('休息狀態的成員不能聯動');

  return ok();
}

function validateBatonPass(state, action, player) {
  if (state.phase !== PHASE.MAIN) return fail('不在主要階段');
  if (player.usedBaton) return fail('本回合已交棒過');
  // K-6 hBP01-005 SP: opp's center/collab cannot baton/move/replace this turn.
  // The lock is keyed to the active player at the time it triggers (state.turnNumber).
  if (state._oppPositionLockedFor?.[state.activePlayer] === state.turnNumber) {
    return fail('對手 SP 鎖定，本回合中心/聯動禁止交棒');
  }

  const center = player.zones[ZONE.CENTER];
  if (!center) return fail('沒有中心成員');
  if (center.state !== MEMBER_STATE.ACTIVE) return fail('中心成員為休息狀態');

  const backstage = player.zones[ZONE.BACKSTAGE];
  const idx = action.backstageIndex;
  if (idx < 0 || idx >= backstage.length) return fail('後台位置無效');
  if (backstage[idx].state !== MEMBER_STATE.ACTIVE) return fail('後台成員為休息狀態');

  // Check baton cost (same color matching as art cost). Reduce colorless
  // requirement by attached-support modifiers (e.g. hBP03-111 ころねすきー: -1).
  const centerCard = getCard(center.cardId);
  const batonCost = parseCost(centerCard?.batonImage);
  const batonReduction = getBatonColorlessReduction(center);
  if (batonReduction > 0) {
    const before = batonCost.colorless || 0;
    const after = Math.max(0, before - batonReduction);
    batonCost.colorless = after;
    batonCost.total = Math.max(0, (batonCost.total || 0) - (before - after));
  }
  if (batonCost.total > 0 && !canPayArtCost(center, batonCost)) {
    return fail(`吶喊卡不足以支付交棒費用（需要 ${batonCost.total} 張）`);
  }

  return ok();
}

function validateUseArt(state, action, player, playerIdx) {
  if (state.phase !== PHASE.PERFORMANCE) return fail('不在表演階段');

  // Only first player skips performance on their first turn
  // Second player CAN use arts on their first turn
  if (state.firstTurn[playerIdx] && playerIdx === state.firstPlayer) {
    return fail('先攻玩家第一回合不能使用藝能');
  }

  const position = action.position; // 'center' or 'collab'
  const member = player.zones[position === 'center' ? ZONE.CENTER : ZONE.COLLAB];
  if (!member) return fail(`${position} 位置沒有成員`);
  if (member.state !== MEMBER_STATE.ACTIVE) return fail('休息狀態的成員不能使用藝能');

  if (player.performedArts[position]) return fail('此位置本回合已使用過藝能');

  const card = getCard(member.cardId);
  if (!card) return fail('卡片資料錯誤');

  const artKey = action.artIndex === 0 ? 'art1' : 'art2';
  const art = card[artKey];
  if (!art) return fail('此成員沒有此藝能');

  // Check art cost (cheer requirement)
  const cost = parseCost(art.image);
  if (!canPayArtCost(member, cost, state, playerIdx)) {
    return fail('吶喊卡不足以使用此藝能');
  }

  // Check target
  const opponent = state.players[1 - playerIdx];
  const targetZone = action.targetPosition === 'center' ? ZONE.CENTER : ZONE.COLLAB;
  const target = opponent.zones[targetZone];
  if (!target) return fail('目標位置沒有成員');

  return ok();
}

// Phase 2.3.3 — get total colorless reduction for an art cost on a given
// member, summing equipment-based + state-level reductions.
//
// State-level reduction sources (added 2026-05-01):
//   state._artColorlessReductionGlobal[playerIdx] — applies to ALL own arts
//     (e.g. hBP05-006 SP「-1 colorless for all 「ネリッサ」 this game」 — but
//     the name filter is handled by *ByName below; this slot is for true
//     all-member reductions if needed).
//   state._artColorlessReductionByName[playerIdx][cardName] — applies to
//     all arts on members matching a specific character name.
//   state._artColorlessReductionByInstance[playerIdx][instanceId] — applies
//     this turn to a specific member instance (e.g. hBP07-073 ラプラス
//     「這個回合中，這個成員的藝能需要的無色吶喊卡數量-2」).
function getStateColorlessReduction(memberInstance, state, playerIdx) {
  if (!state || playerIdx == null) return 0;
  let reduction = 0;
  const memberCard = getCard(memberInstance.cardId);
  const memberName = memberCard?.name;
  const r1 = state._artColorlessReductionGlobal?.[playerIdx];
  if (typeof r1 === 'number') reduction += r1;
  if (memberName) {
    const r2 = state._artColorlessReductionByName?.[playerIdx]?.[memberName];
    if (typeof r2 === 'number') reduction += r2;
  }
  const r3 = state._artColorlessReductionByInstance?.[playerIdx]?.[memberInstance.instanceId];
  if (typeof r3 === 'number') reduction += r3;
  return reduction;
}

// Check if attached cheer can satisfy art cost
function canPayArtCost(memberInstance, cost, state = null, playerIdx = null) {
  // Equipment items (e.g. ASMRマイク) can reduce required colorless cheer.
  // Plus Phase 2.3.3 state-level reductions for oshi-SP / per-member effects.
  // Apply reduction up-front so the rest of the function works on adjusted cost.
  const colorlessReduction = getColorlessReduction(memberInstance)
    + getStateColorlessReduction(memberInstance, state, playerIdx);
  const adjustedColorless = Math.max(0, (cost.colorless || 0) - colorlessReduction);
  const adjustedTotal = Math.max(0, cost.total - colorlessReduction);

  if (adjustedTotal === 0) return true;
  if (memberInstance.attachedCheer.length < adjustedTotal) return false;

  // Greedy: assign colored costs first, then colorless
  const available = memberInstance.attachedCheer.map(c => {
    const card = getCard(c.cardId);
    return card?.color || '無';
  });
  const used = new Set();

  // Assign colored requirements
  for (const [colorKey, count] of Object.entries(cost)) {
    if (colorKey === 'total' || colorKey === 'colorless') continue;
    const gameColor = { white: '白', green: '綠', red: '紅', blue: '藍', purple: '紫', yellow: '黃' }[colorKey];
    if (!gameColor) continue;
    let assigned = 0;
    for (let i = 0; i < available.length && assigned < count; i++) {
      if (!used.has(i) && available[i] === gameColor) {
        used.add(i);
        assigned++;
      }
    }
    if (assigned < count) return false;
  }

  // Assign colorless requirements (any unused cheer)
  let assigned = 0;
  for (let i = 0; i < available.length && assigned < adjustedColorless; i++) {
    if (!used.has(i)) {
      used.add(i);
      assigned++;
    }
  }
  return assigned >= adjustedColorless;
}

export { canPayArtCost };
