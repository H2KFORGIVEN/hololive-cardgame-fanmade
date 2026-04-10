// T11: Damage prevention / reduction
// T13: Knockdown trigger effects
// T15: Self damage (cost to activate arts)

import { getCard } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { parseNumber, applyDamageToMember, getStageMembers } from './common.js';
import { ZONE } from '../../core/constants.js';

// Reduce incoming damage by N
function createDamageReductionHandler(amount) {
  return function handler(state, context) {
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_REDUCTION', amount, duration: 'turn' },
      log: `傷害減少 ${amount}`,
    };
  };
}

// On knockdown: trigger an effect (e.g., send cheer, draw card)
function createKnockdownTriggerHandler(effectType, amount = 1) {
  return function handler(state, context) {
    const p = context.player;
    const player = state.players[p];

    if (effectType === 'draw') {
      for (let i = 0; i < amount; i++) {
        if (player.zones[ZONE.DECK].length > 0) {
          const card = player.zones[ZONE.DECK].shift();
          card.faceDown = false;
          player.zones[ZONE.HAND].push(card);
        }
      }
      return { state, resolved: true, log: `擊倒時抽 ${amount} 張牌` };
    }

    if (effectType === 'cheer') {
      return {
        state, resolved: false,
        prompt: { type: 'CHEER_ASSIGN', player: p,
          message: `擊倒效果：選擇成員接收 ${amount} 張吶喊卡`,
          count: amount, source: 'cheerDeck',
          targets: getStageMembers(player).map(m => m.inst.instanceId) },
      };
    }

    return { state, resolved: true };
  };
}

// Self damage as arts cost
function createSelfDamageHandler(amount) {
  return function handler(state, context) {
    if (context.memberInst) {
      applyDamageToMember(context.memberInst, amount);
      return { state, resolved: true, log: `自身受到 ${amount} 特殊傷害` };
    }
    return { state, resolved: true };
  };
}

export function registerPreventDamage(effectsData) {
  let registered = 0;
  for (const e of effectsData) {
    const text = e.text.toLowerCase();
    let hook = HOOK.ON_DAMAGE_TAKEN;

    if (e.categories?.includes('PREVENT_DAMAGE')) {
      const amount = parseNumber(text.match(/reduce.*?(\d+)/i)?.[0] || text.match(/(\d+).*less/i)?.[0] || '20');
      if (e.hook === 'effectG') hook = HOOK.ON_DAMAGE_TAKEN;
      else if (e.hook === 'support') hook = HOOK.ON_DAMAGE_TAKEN;
      registerEffect(e.id, hook, createDamageReductionHandler(amount));
      registered++;
    }

    if (e.categories?.includes('KNOCKDOWN_TRIGGER')) {
      hook = HOOK.ON_KNOCKDOWN;
      if (text.includes('draw')) {
        const count = parseNumber(text.match(/draw\s+(\d+)/i)?.[0] || '1');
        registerEffect(e.id, hook, createKnockdownTriggerHandler('draw', count));
        registered++;
      } else if (text.includes('cheer') || text.includes('shouting')) {
        const count = parseNumber(text.match(/(\d+)\s+(?:cheer|shouting)/i)?.[0] || '1');
        registerEffect(e.id, hook, createKnockdownTriggerHandler('cheer', count));
        registered++;
      }
    }

    if (e.categories?.includes('SELF_DAMAGE')) {
      const amount = parseNumber(text.match(/(\d+)\s*(?:point|special\s+damage)/i)?.[0] || '10');
      hook = e.hook === 'art1' || e.hook === 'art2' ? HOOK.ON_ART_RESOLVE : HOOK.ON_PLAY;
      registerEffect(e.id, hook, createSelfDamageHandler(amount));
      registered++;
    }
  }
  return registered;
}
