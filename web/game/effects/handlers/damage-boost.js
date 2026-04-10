// T01: Damage boost effects — "+N damage", "skill damage +N"
// Parses the boost amount from card effect text and applies it

import { getCard, localized } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { parseNumber, parseColor, getStageMembers, filterByColor } from './common.js';

// Pattern: "[condition] damage +N" or "arts damage +N"
// Common variants:
// - "this round, one of your X members' skill damage +N"
// - "center member damage +N"
// - "this member's arts damage +N"

function createDamageBoostHandler(amount, target = 'self', color = null) {
  return function handler(state, context) {
    const p = context.player;
    const player = state.players[p];

    // For now, return a structured result the engine can apply
    return {
      state,
      resolved: true,
      effect: {
        type: 'DAMAGE_BOOST',
        amount,
        target, // 'self' | 'center' | 'collab' | 'any_own' | 'color'
        color,
        duration: 'turn', // 'turn' | 'permanent'
      },
      log: `傷害 +${amount}${color ? ` (${color}成員)` : ''}`,
    };
  };
}

// Auto-register from effect analysis
export function registerDamageBoosts(effectsData) {
  let registered = 0;

  for (const e of effectsData) {
    if (!e.categories?.includes('DAMAGE_BOOST')) continue;

    const text = e.text.toLowerCase();
    const amount = parseNumber(text.match(/damage\s*\+\s*(\d+)/i)?.[1] || text.match(/\+(\d+)\s*damage/i)?.[1] || '0');
    if (amount === 0) continue;

    const color = parseColor(text);

    // Determine target
    let target = 'self';
    if (text.includes('center')) target = 'center';
    else if (text.includes('collab')) target = 'collab';

    // Determine hook
    let hook = HOOK.ON_ART_DECLARE;
    if (e.hook === 'oshiSkill') hook = HOOK.ON_OSHI_SKILL;
    else if (e.hook === 'effectC') hook = HOOK.ON_COLLAB;
    else if (e.hook === 'effectB') hook = HOOK.ON_BLOOM;
    else if (e.hook === 'support') hook = HOOK.ON_PLAY;

    registerEffect(e.id, hook, createDamageBoostHandler(amount, target, color));
    registered++;
  }

  return registered;
}
