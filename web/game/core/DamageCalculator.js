import { getCard } from './CardDatabase.js';
import { ICON_TO_COLOR } from './constants.js';
import { getExtraHp, getDamageReceivedModifier } from './AttachedSupportEffects.js';

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
// Incoming damage is also adjusted by equipment damageReceivedModifier
// (e.g. 白銀聖騎士団 fan: −10 damage taken).
export function applyDamage(memberInstance, amount) {
  const card = getCard(memberInstance.cardId);
  if (!card || !card.hp) return { knockedDown: false };

  const effectiveHp = card.hp + getExtraHp(memberInstance);
  const received = Math.max(0, amount + getDamageReceivedModifier(memberInstance));

  memberInstance.damage += received;

  const knockedDown = memberInstance.damage >= effectiveHp;
  return {
    knockedDown,
    currentDamage: memberInstance.damage,
    maxHp: effectiveHp,
    overkill: knockedDown ? memberInstance.damage - effectiveHp : 0,
  };
}

// Check if a member is knocked down (also respects equipment HP boosts)
export function isKnockedDown(memberInstance) {
  const card = getCard(memberInstance.cardId);
  if (!card || !card.hp) return false;
  return memberInstance.damage >= card.hp + getExtraHp(memberInstance);
}
