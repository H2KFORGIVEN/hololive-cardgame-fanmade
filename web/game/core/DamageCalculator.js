import { getCard } from './CardDatabase.js';
import { ICON_TO_COLOR } from './constants.js';
import { getExtraHp, getDamageReceivedModifier } from './AttachedSupportEffects.js';
import { getMemberSelfExtraHp } from './MemberSelfEffects.js';

export function calculateDamage(attackerInstance, artIndex, targetInstance) {
  const attackerCard = getCard(attackerInstance.cardId);
  const targetCard = getCard(targetInstance.cardId);
  if (!attackerCard || !targetCard) return { total: 0, base: 0, special: 0 };

  const artKey = artIndex === 0 ? 'art1' : 'art2';
  const art = attackerCard[artKey];
  if (!art) return { total: 0, base: 0, special: 0 };

  // Base damage (parse integer from string like "70+" or number like 40)
  const base = parseInt(art.damage) || 0;

  // Special attack color bonus
  // Filename patterns: "icons/tokkou_30_red.png" / "icons/tokkou_50_blue.png" → +30/+50
  // Also accept legacy "icons/arts_color.png" (default +50)
  let special = 0;
  if (art.specialAttackImage) {
    const tokkouMatch = art.specialAttackImage.match(/tokkou_(\d+)_(\w+)\.png/);
    const legacyMatch = art.specialAttackImage.match(/arts_(\w+)\.png/);
    if (tokkouMatch) {
      const amount = parseInt(tokkouMatch[1]);
      const gameColor = ICON_TO_COLOR[tokkouMatch[2]];
      if (gameColor && targetCard.color === gameColor) special = amount;
    } else if (legacyMatch) {
      const gameColor = ICON_TO_COLOR[legacyMatch[1]];
      if (gameColor && targetCard.color === gameColor) special = 50;
    }
  }

  return {
    total: base + special,
    base,
    special,
    artName: art.name || '',
    hasEffectBonus: typeof art.damage === 'string' && String(art.damage).includes('+'),
  };
}

// Apply damage to a member instance, return whether it's knocked down.
// HP is augmented by any equipment effects (e.g. カワイイスタジャン Buzz +30).
// Incoming damage is also adjusted by:
//   - equipment damageReceivedModifier (e.g. 白銀聖騎士団 fan: −10)
//   - K-3 passive observer chain: stage-level passives on either side
//     (e.g. hBP04-074 アーニャ in own center → self + collab take −10)
// Pass `state` (game state) and `targetPlayerIdx` (target's player index) so
// the passive observer can find the target's stage. Legacy 2-arg call still
// works with no passive observer.
export function applyDamage(memberInstance, amount, state = null, targetPlayerIdx = null) {
  const card = getCard(memberInstance.cardId);
  if (!card || !card.hp) return { knockedDown: false };

  const effectiveHp = card.hp + getExtraHp(memberInstance) + getMemberSelfExtraHp(memberInstance);
  let received = Math.max(0, amount + getDamageReceivedModifier(memberInstance));

  // K-3: passive observer chain — walk own stage for passives that modify
  // incoming damage to this target. Done inline (small number of known
  // passives; expanded as needed). Negative modifier = damage reduction.
  if (state && targetPlayerIdx != null) {
    received = Math.max(0, received + _getStagePassiveDamageReceivedModifier(state, memberInstance, targetPlayerIdx));
  }

  memberInstance.damage += received;

  const knockedDown = memberInstance.damage >= effectiveHp;
  return {
    knockedDown,
    currentDamage: memberInstance.damage,
    maxHp: effectiveHp,
    overkill: knockedDown ? memberInstance.damage - effectiveHp : 0,
  };
}

// K-3 passive observer registry: stage-level effects that modify damage
// TAKEN by `target`. Keys are observer (passive provider) cardIds; the
// function gets called with (state, observer, target, targetPlayerIdx)
// and returns the modifier (negative = reduction). Observer must be on
// the SAME side as target (own-stage passive). Conditions are checked
// in-line.
const _STAGE_PASSIVE_DAMAGE_RECEIVED = {
  // hBP04-074 アーニャ effectG: [限定中心位置] this + own collab take −10
  'hBP04-074': (state, observer, target, ownIdx) => {
    const own = state.players[ownIdx];
    if (!own || own.zones.center?.instanceId !== observer.instanceId) return 0;
    // Apply if target IS this observer or own collab
    if (target.instanceId === observer.instanceId) return -10;
    if (own.zones.collab?.instanceId === target.instanceId) return -10;
    return 0;
  },
  // hBP04-087 エリザベス Spot effectG: [限定聯動位置] own center Debut −20
  'hBP04-087': (state, observer, target, ownIdx) => {
    const own = state.players[ownIdx];
    if (!own || own.zones.collab?.instanceId !== observer.instanceId) return 0;
    if (own.zones.center?.instanceId !== target.instanceId) return 0;
    if (getCard(target.cardId)?.bloom !== 'Debut') return 0;
    return -20;
  },
};

// Position-aware passive observers driven by ATTACHED SUPPORT cards. Keyed
// by support cardId; called with the wearer (and the attack target) so the
// handler can check wearer position and whether `target` is the wearer.
const _SUPPORT_PASSIVE_DAMAGE_RECEIVED = {
  // hBP01-121 Kotori: wearer in own center/collab → wearer takes −10.
  'hBP01-121': (state, wearer, target, ownIdx) => {
    if (target.instanceId !== wearer.instanceId) return 0;
    const own = state.players[ownIdx];
    if (own.zones.center?.instanceId !== wearer.instanceId &&
        own.zones.collab?.instanceId !== wearer.instanceId) return 0;
    return -10;
  },
};

function _getStagePassiveDamageReceivedModifier(state, target, ownIdx) {
  const own = state.players[ownIdx];
  if (!own) return 0;
  let total = 0;
  const stage = [
    own.zones.center, own.zones.collab,
    ...(own.zones.backstage || []),
  ].filter(Boolean);
  for (const observer of stage) {
    // Member-driven passives (e.g. hBP04-074 アーニャ effectG)
    const fn = _STAGE_PASSIVE_DAMAGE_RECEIVED[observer.cardId];
    if (typeof fn === 'function') {
      total += fn(state, observer, target, ownIdx) || 0;
    }
    // Support-driven passives needing position context (e.g. hBP01-121 Kotori)
    for (const sup of (observer.attachedSupport || [])) {
      const supFn = _SUPPORT_PASSIVE_DAMAGE_RECEIVED[sup.cardId];
      if (typeof supFn === 'function') {
        total += supFn(state, observer, target, ownIdx) || 0;
      }
    }
  }
  return total;
}

// K-4 outgoing-damage passive observers: stage members on the ATTACKER's
// side that buff outgoing damage when conditions match. Walked from
// processUseArt before applyDamage (via getOutgoingDamageBoost helper below).
const _STAGE_PASSIVE_DAMAGE_OUT = {
  // hBP04-062 森カリオペ effectG: [限定中心位置或聯動位置] 帶有「森カリオペの鎌」或
  // 「Death-sensei」 → 自己標示#Myth的中心成員藝能傷害+30
  'hBP04-062': (state, observer, attacker, target, attackerIdx) => {
    const own = state.players[attackerIdx];
    if (!own) return 0;
    const inCenter = own.zones.center?.instanceId === observer.instanceId;
    const inCollab = own.zones.collab?.instanceId === observer.instanceId;
    if (!inCenter && !inCollab) return 0;
    // Must have 鎌 or Death-sensei attached
    const hasReq = (observer.attachedSupport || []).some(s => {
      const name = getCard(s.cardId)?.name || '';
      return name === '森カリオペの鎌' || name === 'Death-sensei';
    });
    if (!hasReq) return 0;
    // Attacker must be own #Myth center
    if (own.zones.center?.instanceId !== attacker.instanceId) return 0;
    const tag = getCard(attacker.cardId)?.tag || '';
    const tagStr = typeof tag === 'string' ? tag : JSON.stringify(tag);
    if (!tagStr.includes('#Myth')) return 0;
    return 30;
  },
  // hBP02-041 猫又おかゆ effectG: [限定中心位置] 自家所有「猫又おかゆ」對 OPP 中心
  // 成員的特殊傷害 +20。Approximation: apply +20 when attacker is named おかゆ
  // and target is opp center. (Strict "special-damage only" qualifier is
  // skipped — most おかゆ arts have specials anyway.)
  'hBP02-041': (state, observer, attacker, target, attackerIdx) => {
    const own = state.players[attackerIdx];
    if (!own) return 0;
    if (own.zones.center?.instanceId !== observer.instanceId) return 0;
    if (getCard(attacker.cardId)?.name !== '猫又おかゆ') return 0;
    const opp = state.players[1 - attackerIdx];
    if (opp?.zones.center?.instanceId !== target.instanceId) return 0;
    return 20;
  },
};

/**
 * K-4: walk the attacker's stage for cross-member damage boosts and return
 * the summed modifier. Called by processUseArt before applyDamage so
 * passive providers (e.g. hBP04-062 with 鎌 → own #Myth center +30) can
 * augment the attack uniformly.
 */
export function getOutgoingDamageBoost(state, attacker, target, attackerPlayerIdx) {
  const own = state?.players?.[attackerPlayerIdx];
  if (!own) return 0;
  let total = 0;
  const stage = [
    own.zones.center, own.zones.collab,
    ...(own.zones.backstage || []),
  ].filter(Boolean);
  for (const observer of stage) {
    const fn = _STAGE_PASSIVE_DAMAGE_OUT[observer.cardId];
    if (typeof fn === 'function') {
      total += fn(state, observer, attacker, target, attackerPlayerIdx) || 0;
    }
  }
  return total;
}

// Check if a member is knocked down (also respects equipment HP boosts and
// member-self HP passives like hBP07-014's "+10 per overlap").
export function isKnockedDown(memberInstance) {
  const card = getCard(memberInstance.cardId);
  if (!card || !card.hp) return false;
  return memberInstance.damage >= card.hp + getExtraHp(memberInstance) + getMemberSelfExtraHp(memberInstance);
}
