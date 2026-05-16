// T10: Dice roll effects
// "Roll die once: for every 1 point, damage +10"
// "Roll die: if result is odd, effect A; if even, effect B"

import { registerEffect, HOOK } from '../EffectRegistry.js';
import { parseNumber } from './common.js';

function createDiceRollHandler(rollCount = 1, perPointBonus = 0, effectType = 'damage_per_point') {
  return function handler(state, context) {
    // Roll the dice
    const rolls = [];
    let total = 0;
    for (let i = 0; i < rollCount; i++) {
      const roll = Math.floor(Math.random() * 6) + 1;
      rolls.push(roll);
      total += roll;
    }

    const rollText = rolls.join(', ');

    if (effectType === 'damage_per_point' && perPointBonus > 0) {
      const bonus = total * perPointBonus;
      state.log.push({
        turn: state.turnNumber, player: context.player,
        msg: `  骰子: [${rollText}] = ${total} → 傷害 +${bonus}`,
        ts: Date.now()
      });
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: bonus, target: 'self', duration: 'instant' },
        log: `骰子 [${rollText}] 傷害 +${bonus}`,
      };
    }

    // Generic dice result — show to player
    state.log.push({
      turn: state.turnNumber, player: context.player,
      msg: `  骰子: [${rollText}] = ${total}`,
      ts: Date.now()
    });

    return {
      state, resolved: true,
      effect: { type: 'DICE_RESULT', rolls, total },
      log: `骰子 [${rollText}] = ${total}`,
    };
  };
}

export function registerDiceRoll(effectsData) {
  let registered = 0;
  for (const e of effectsData) {
    if (!e.categories?.includes('DICE_ROLL')) continue;
    const text = e.text.toLowerCase();

    // Parse roll count
    const rollCountMatch = text.match(/(?:roll|rolled).*?(\d+)\s*time/i) || text.match(/(\d+)\s*(?:die|dice)/i);
    const rollCount = rollCountMatch ? parseInt(rollCountMatch[1]) : 1;

    // Parse per-point bonus
    const perPointMatch = text.match(/(?:every|each|per)\s+(?:1\s+)?point.*?\+?(\d+)/i) || text.match(/\+(\d+).*per.*point/i);
    const perPointBonus = perPointMatch ? parseInt(perPointMatch[1]) : 0;

    let hook = HOOK.ON_ART_DECLARE;
    if (e.hook === 'art1' || e.hook === 'art2') hook = HOOK.ON_ART_DECLARE;
    else if (e.hook === 'oshiSkill') hook = HOOK.ON_OSHI_SKILL;
    else if (e.hook === 'effectC') hook = HOOK.ON_COLLAB;
    else if (e.hook === 'effectB') hook = HOOK.ON_BLOOM;

    if (perPointBonus > 0) {
      registerEffect(e.id, hook, createDiceRollHandler(rollCount, perPointBonus, 'damage_per_point'));
    } else {
      registerEffect(e.id, hook, createDiceRollHandler(rollCount, 0, 'generic'));
    }
    registered++;
  }
  return registered;
}
