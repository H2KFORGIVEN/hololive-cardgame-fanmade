import { PHASE, ZONE, ACTION, BLOOM_ORDER, MAX_STAGE_MEMBERS, MEMBER_STATE, parseCost, isSupport, isMember } from './constants.js';
import { getCard, getCardsByName } from './CardDatabase.js';
import { getStageCount, findInstance } from './GameState.js';

export function validateAction(state, action) {
  const p = state.activePlayer;
  const player = state.players[p];
  const phase = state.phase;

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

function validateBloom(state, action, player) {
  if (state.phase !== PHASE.MAIN) return fail('不在主要階段');
  if (state.firstTurn[state.activePlayer]) return fail('第一回合不能綻放');

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

  // Check bloom level progression
  const currentLevel = targetCard.bloom;
  const newLevel = bloomCard.bloom;
  const currentIdx = BLOOM_ORDER.indexOf(currentLevel);
  const newIdx = BLOOM_ORDER.indexOf(newLevel);

  if (currentIdx === -1 || newIdx === -1) return fail('無效的綻放等級');
  if (newIdx <= currentIdx) return fail('綻放等級不能下降');
  // Allow skipping levels (Debut → 2nd is valid if the card exists)

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

  const center = player.zones[ZONE.CENTER];
  if (!center) return fail('沒有中心成員');
  if (center.state !== MEMBER_STATE.ACTIVE) return fail('中心成員為休息狀態');

  const backstage = player.zones[ZONE.BACKSTAGE];
  const idx = action.backstageIndex;
  if (idx < 0 || idx >= backstage.length) return fail('後台位置無效');
  if (backstage[idx].state !== MEMBER_STATE.ACTIVE) return fail('後台成員為休息狀態');

  // Check baton cost (same color matching as art cost)
  const centerCard = getCard(center.cardId);
  const batonCost = parseCost(centerCard?.batonImage);
  if (!canPayArtCost(center, batonCost)) {
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
  if (!canPayArtCost(member, cost)) {
    return fail('吶喊卡不足以使用此藝能');
  }

  // Check target
  const opponent = state.players[1 - playerIdx];
  const targetZone = action.targetPosition === 'center' ? ZONE.CENTER : ZONE.COLLAB;
  const target = opponent.zones[targetZone];
  if (!target) return fail('目標位置沒有成員');

  return ok();
}

// Check if attached cheer can satisfy art cost
function canPayArtCost(memberInstance, cost) {
  if (cost.total === 0) return true;
  if (memberInstance.attachedCheer.length < cost.total) return false;

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
  const colorlessNeeded = cost.colorless || 0;
  let assigned = 0;
  for (let i = 0; i < available.length && assigned < colorlessNeeded; i++) {
    if (!used.has(i)) {
      used.add(i);
      assigned++;
    }
  }
  return assigned >= colorlessNeeded;
}

export { canPayArtCost };
