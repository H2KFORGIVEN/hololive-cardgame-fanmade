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
  let special = 0;
  if (art.specialAttackImage) {
    // Parse color from icon filename: "icons/arts_red.png" => "red"
    const match = art.specialAttackImage.match(/arts_(\w+)\.png/);
    if (match) {
      const iconColor = match[1];
      const gameColor = ICON_TO_COLOR[iconColor];
      if (gameColor && targetCard.color === gameColor) {
        // Special attack bonus: typically +50 but varies
        // The bonus is often encoded in the damage string "70+" or in the effect text
        // For now, use a standard +50 bonus (most common value)
        special = 50;
      }
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
