// T02: Special damage effects — "deal N special damage to X"
// Special damage bypasses normal damage calculation

import { getCard } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { parseNumber, applyDamageToMember, getStageMembers } from './common.js';
import { ZONE } from '../../core/constants.js';

function createSpecialDamageHandler(amount, targetType = 'opponent_center') {
  return function handler(state, context) {
    const p = context.player;
    const opponent = state.players[1 - p];

    let targets = [];
    if (targetType === 'opponent_center' && opponent.zones[ZONE.CENTER]) {
      targets.push(opponent.zones[ZONE.CENTER]);
    } else if (targetType === 'opponent_collab' && opponent.zones[ZONE.COLLAB]) {
      targets.push(opponent.zones[ZONE.COLLAB]);
    } else if (targetType === 'opponent_any') {
      // Need player choice — return prompt
      return {
        state,
        resolved: false,
        prompt: {
          type: 'SELECT_TARGET',
          player: p,
          message: `選擇對手的成員，造成 ${amount} 特殊傷害`,
          targets: getStageMembers(opponent).map(m => m.inst.instanceId),
        },
      };
    } else if (targetType === 'all_opponent') {
      targets = getStageMembers(opponent).map(m => m.inst);
    }

    for (const target of targets) {
      const result = applyDamageToMember(target, amount);
      state.log.push({
        turn: state.turnNumber, player: p,
        msg: `  ${getCard(target.cardId)?.name || ''} 受到 ${amount} 特殊傷害 (${result.damage}/${result.hp})`,
        ts: Date.now()
      });
    }

    return { state, resolved: true, log: `造成 ${amount} 特殊傷害` };
  };
}

export function registerSpecialDamage(effectsData) {
  let registered = 0;

  for (const e of effectsData) {
    if (!e.categories?.includes('SPECIAL_DAMAGE')) continue;

    const text = e.text.toLowerCase();
    const amountMatch = text.match(/(\d+)\s*(?:point(?:s)?)?(?:\s+of)?\s+special\s+damage/i);
    const amount = amountMatch ? parseInt(amountMatch[1]) : 0;
    if (amount === 0) continue;

    let targetType = 'opponent_center';
    if (text.includes('collab')) targetType = 'opponent_collab';
    else if (text.includes('all') || text.includes('each')) targetType = 'all_opponent';

    let hook = HOOK.ON_ART_RESOLVE;
    if (e.hook === 'oshiSkill' || e.hook === 'spSkill') hook = HOOK.ON_OSHI_SKILL;
    else if (e.hook === 'effectC') hook = HOOK.ON_COLLAB;
    else if (e.hook === 'effectB') hook = HOOK.ON_BLOOM;
    else if (e.hook === 'support') hook = HOOK.ON_PLAY;
    else if (e.hook === 'art1' || e.hook === 'art2') hook = HOOK.ON_ART_RESOLVE;

    registerEffect(e.id, hook, createSpecialDamageHandler(amount, targetType));
    registered++;
  }

  return registered;
}
