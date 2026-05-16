// T05: HP restore / heal effects

import { getCard } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { parseNumber, healMember, getStageMembers } from './common.js';

function createHealHandler(amount, target = 'self') {
  return function handler(state, context) {
    const p = context.player;
    const player = state.players[p];

    if (target === 'self' && context.memberInst) {
      const remaining = healMember(context.memberInst, amount);
      return { state, resolved: true, log: `回復 ${amount} HP (剩餘傷害: ${remaining})` };
    }

    // Need player to choose target
    return {
      state,
      resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER',
        player: p,
        message: `選擇成員回復 ${amount} HP`,
        targets: getStageMembers(player)
          .filter(m => m.inst.damage > 0)
          .map(m => m.inst.instanceId),
      },
    };
  };
}

export function registerHpRestore(effectsData) {
  let registered = 0;
  for (const e of effectsData) {
    if (!e.categories?.includes('RECOVER_HP')) continue;
    const text = e.text.toLowerCase();
    const amountMatch = text.match(/(\d+)\s*(?:point|hp|damage)/i);
    const amount = amountMatch ? parseInt(amountMatch[1]) : 50;

    let target = 'self';
    if (text.includes('your') && !text.includes('this member')) target = 'choose';

    let hook = HOOK.ON_BLOOM;
    if (e.hook === 'effectC') hook = HOOK.ON_COLLAB;
    else if (e.hook === 'oshiSkill') hook = HOOK.ON_OSHI_SKILL;
    else if (e.hook === 'support') hook = HOOK.ON_PLAY;
    else if (e.hook === 'art1' || e.hook === 'art2') hook = HOOK.ON_ART_RESOLVE;

    registerEffect(e.id, hook, createHealHandler(amount, target));
    registered++;
  }
  return registered;
}
