import { getCard } from './CardDatabase.js';
import { ICON_TO_COLOR } from './constants.js';

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

// Apply damage to a member instance, return whether it's knocked down
export function applyDamage(memberInstance, amount) {
  const card = getCard(memberInstance.cardId);
  if (!card || !card.hp) return { knockedDown: false };

  memberInstance.damage += amount;

  const knockedDown = memberInstance.damage >= card.hp;
  return {
    knockedDown,
    currentDamage: memberInstance.damage,
    maxHp: card.hp,
    overkill: knockedDown ? memberInstance.damage - card.hp : 0,
  };
}

// Check if a member is knocked down
export function isKnockedDown(memberInstance) {
  const card = getCard(memberInstance.cardId);
  if (!card || !card.hp) return false;
  return memberInstance.damage >= card.hp;
}
